// Conversa com o modelo: histórico + ficha + laço de ferramentas (máx. 3 rodadas).
import { BOTS, MAX_TOOL_ROUNDS } from './config.js';
import { montarSystem } from './prompt.js';
import { toolsDoBot, executarFerramenta } from './tools.js';

// A API exige começar com "user" e alternar papéis: limpa e junta mensagens seguidas do mesmo papel.
export function historicoParaModelo(rows) {
  const out = [];
  for (const r of rows) {
    if (!r.content || !['user', 'assistant'].includes(r.role)) continue;
    if (!out.length && r.role !== 'user') continue;
    const prev = out[out.length - 1];
    if (prev && prev.role === r.role) prev.content += `\n\n${r.content}`;
    else out.push({ role: r.role, content: r.content });
  }
  return out;
}

// Marca o fim da conversa para cache: nas rodadas de ferramenta, o histórico inteiro é lido do cache.
export function comCacheNoFim(messages) {
  if (!messages.length) return messages;
  const copia = messages.slice();
  const ult = copia[copia.length - 1];
  const blocos = typeof ult.content === 'string' ? [{ type: 'text', text: ult.content }] : ult.content.map((b) => ({ ...b }));
  blocos[blocos.length - 1] = { ...blocos[blocos.length - 1], cache_control: { type: 'ephemeral' } };
  copia[copia.length - 1] = { ...ult, content: blocos };
  return copia;
}

const textoFinal = (resp) =>
  (resp?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();

export async function rodarConversa({ bot, email, mensagem, compradora, acesso, db, llm, now = new Date() }) {
  const cfg = BOTS[bot];
  const [hist, ficha] = await Promise.all([
    db.listMessages(email, bot, cfg.historico),
    bot === 'ju' ? db.getFicha(email) : Promise.resolve(null),
  ]);

  const messages = historicoParaModelo([...hist, { role: 'user', content: mensagem }]);
  const tools = toolsDoBot(bot);
  const base = {
    model: cfg.model(),
    max_tokens: cfg.maxTokens,
    system: montarSystem(bot, { compradora, ficha, acesso, now }),
    tools,
  };

  const ferramentasUsadas = [];
  let ultimoTexto = '';
  const partes = []; // texto escrito em cada rodada (inclusive antes de chamar uma ferramenta)
  let resp;
  for (let rodada = 0; rodada <= MAX_TOOL_ROUNDS; rodada++) {
    const semFerramentas = rodada === MAX_TOOL_ROUNDS;
    resp = await llm.create({ ...base, messages: comCacheNoFim(messages), ...(semFerramentas ? { tool_choice: { type: 'none' } } : {}) });
    // Se o raciocínio interno gastou todo o limite sem escrever nada, refaz sem raciocínio prévio.
    if (resp.stop_reason === 'max_tokens' && !textoFinal(resp) && !(resp.content || []).some((b) => b.type === 'tool_use')) {
      resp = await llm.create({ ...base, thinking: { type: 'between_tools' }, messages: comCacheNoFim(messages), ...(semFerramentas ? { tool_choice: { type: 'none' } } : {}) });
    }
    if (process.env.DEBUG_LLM) console.error('[llm]', rodada, resp.stop_reason, JSON.stringify(resp.usage?.output_tokens_details), resp.usage?.output_tokens, (resp.content||[]).map((b) => b.type).join(','));
    const t = textoFinal(resp);
    if (t) { ultimoTexto = t; if (!partes.includes(t)) partes.push(t); }
    if (resp.stop_reason !== 'tool_use') break;

    const usos = (resp.content || []).filter((b) => b.type === 'tool_use');
    if (!usos.length) break;
    const resultados = [];
    for (const u of usos) {
      let res;
      try {
        res = await executarFerramenta(u, { db, email, bot, now });
      } catch (e) {
        res = { ok: false, erro: 'falha ao executar; siga a conversa sem isso' };
        console.error('[tool]', u.name, e);
      }
      ferramentasUsadas.push({ nome: u.name, input: u.input, ok: res.ok });
      resultados.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(res), ...(res.ok ? {} : { is_error: true }) });
    }
    messages.push({ role: 'assistant', content: resp.content });
    messages.push({ role: 'user', content: resultados });
  }

  if (!textoFinal(resp) && !ultimoTexto) console.error('[chat] resposta vazia', resp?.stop_reason, JSON.stringify(resp?.content || []).slice(0, 600));
  const reply = partes.join('\n\n') ||
    'Desculpe, não consegui montar a resposta agora. Pode me mandar de novo, por favor?';

  await db.addMessages([
    { email, bot, role: 'user', content: mensagem },
    { email, bot, role: 'assistant', content: reply },
  ]);
  return { reply, ferramentas: ferramentasUsadas, usage: resp?.usage };
}
