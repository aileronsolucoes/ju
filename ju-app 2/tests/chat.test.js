import { novasDeps, chamar } from './helpers.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rodarConversa, historicoParaModelo } from '../lib/chat.js';
import { createMemoryDb } from '../lib/db-memory.js';
import { mesclarFicha } from '../lib/tools.js';
import { promptBase } from '../lib/prompt.js';
import { CONSENT_VERSION } from '../lib/config.js';
import chat from '../api/chat.js';
import history from '../api/history.js';

// Modelo roteirizado: devolve as respostas na ordem e guarda as chamadas.
function roteiro(respostas) {
  return {
    calls: [],
    async create(body) {
      this.calls.push(structuredClone(body));
      const r = respostas[Math.min(this.calls.length - 1, respostas.length - 1)];
      return typeof r === 'function' ? r(body) : r;
    },
  };
}
const usar = (name, input, id = name) => ({ stop_reason: 'tool_use', content: [{ type: 'text', text: 'Vou anotar.' }, { type: 'tool_use', id, name, input }] });
const falar = (text) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }] });
const compradora = { email: 'a@a.com', nome: 'Ana', upsell1: true, upsell1_desde: new Date().toISOString(), outros_produtos: ['sustentar'] };

test('laço de ferramentas: salva ficha, registra um encaminhamento e responde', async () => {
  const db = createMemoryDb();
  const llm = roteiro([
    usar('salvar_ficha', { campos: { peso_inicial_kg: 86, dia1: '2026-11-02', mapa: { acorda: '6:00' } } }, 't1'),
    usar('registrar_solicitacao', { tipo: 'reembolso', mensagem: 'pediu para falar com uma pessoa' }, 't2'),
    falar('Pronto, registrado.'),
  ]);
  const r = await rodarConversa({ bot: 'ju', email: 'a@a.com', mensagem: 'oi', compradora, acesso: { dia_acesso: 2, dias_restantes: 89 }, db, llm });
  // o texto escrito antes de uma ferramenta também chega à aluna (sem repetir)
  assert.equal(r.reply, 'Vou anotar.\n\nPronto, registrado.');
  assert.equal(llm.calls.length, 3);
  assert.deepEqual(r.ferramentas.map((f) => f.nome), ['salvar_ficha', 'registrar_solicitacao']);
  assert.deepEqual(await db.getFicha('a@a.com'), { peso_inicial_kg: 86, dia1: '2026-11-02', mapa: { acorda: '6:00' } });
  const sol = await db.listSolicitacoes();
  // a Ju não registra reembolso: um tipo fora da lista vira 'outro'
  assert.equal(sol[0].tipo, 'outro');
  assert.equal(sol[0].produto, 'Protocolo 4S Consultório');
  // o resultado da ferramenta volta para o modelo com o id certo
  const ultima = llm.calls[2].messages.at(-1);
  assert.equal(ultima.role, 'user');
  assert.equal(ultima.content[0].type, 'tool_result');
  assert.equal(ultima.content[0].tool_use_id, 't2');
  // mensagem da aluna e resposta salvas
  const h = await db.listMessages('a@a.com', 'ju');
  assert.deepEqual(h.map((m) => [m.role, m.content]), [['user', 'oi'], ['assistant', 'Vou anotar.\n\nPronto, registrado.']]);
});

test('laço de ferramentas: no máximo 3 rodadas, a 4ª chamada proíbe ferramentas', async () => {
  const db = createMemoryDb();
  const llm = roteiro([(body) => (body.tool_choice?.type === 'none' ? falar('Final sem ferramentas.') : usar('salvar_ficha', { campos: { x: 1 } }, `t${Math.random()}`))]);
  const r = await rodarConversa({ bot: 'ju', email: 'a@a.com', mensagem: 'oi', compradora, acesso: {}, db, llm });
  assert.equal(llm.calls.length, 4);
  assert.equal(llm.calls[3].tool_choice.type, 'none');
  assert.equal(r.reply, 'Vou anotar.\n\nFinal sem ferramentas.');
});

test('falha numa ferramenta não derruba a conversa', async () => {
  const db = createMemoryDb();
  db.saveFicha = async () => { throw new Error('banco fora'); };
  const llm = roteiro([usar('salvar_ficha', { campos: { a: 1 } }, 't1'), falar('Tudo certo por aqui.')]);
  const r = await rodarConversa({ bot: 'ju', email: 'a@a.com', mensagem: 'oi', compradora, acesso: {}, db, llm });
  assert.equal(r.reply, 'Vou anotar.\n\nTudo certo por aqui.');
  assert.equal(llm.calls[1].messages.at(-1).content[0].is_error, true);
});

test('prompt: bloco fixo cacheado, sem a seção 13, com ficha e data no bloco dinâmico', async () => {
  const db = createMemoryDb();
  await db.saveFicha('a@a.com', { peso_inicial_kg: 86, motivo_desistencias: 'fim de semana' });
  const llm = roteiro([falar('ok')]);
  await rodarConversa({ bot: 'ju', email: 'a@a.com', mensagem: 'oi', compradora, acesso: { dia_acesso: 5, dias_restantes: 86 }, db, llm });
  const body = llm.calls[0];
  assert.equal(body.max_tokens, 8000);
  assert.equal(body.model, 'claude-sonnet-5-5');
  assert.deepEqual(body.system[0].cache_control, { type: 'ephemeral' });
  assert.match(body.system[0].text, /^## 1\. Quem você é/);
  assert.match(body.system[0].text, /## 12\. Lembretes finais/);
  assert.doesNotMatch(body.system[0].text, /Notas para a equipe/);
  assert.match(body.system[1].text, /fim de semana/);
  assert.match(body.system[1].text, /dia 5 de 90/);
  assert.match(body.system[1].text, /Protocolo Sustentar \(5S\)/);
  assert.match(body.system[1].text, /horário de Brasília/);
  assert.equal(body.system[1].cache_control, undefined);
  assert.deepEqual(body.messages.at(-1).content.at(-1).cache_control, { type: 'ephemeral' }, 'fim da conversa também cacheado');
  assert.deepEqual(body.tools.map((t) => t.name), ['salvar_ficha', 'registrar_solicitacao']);
  assert.ok(promptBase('ju').length > 30000);
});

test('histórico: começa pela aluna e junta mensagens seguidas do mesmo papel', () => {
  const h = historicoParaModelo([
    { role: 'assistant', content: 'saudação' },
    { role: 'user', content: 'a' }, { role: 'user', content: 'b' },
    { role: 'assistant', content: 'c' }, { role: 'user', content: 'd' },
  ]);
  assert.deepEqual(h, [{ role: 'user', content: 'a\n\nb' }, { role: 'assistant', content: 'c' }, { role: 'user', content: 'd' }]);
});

test('ficha: mescla campos, objetos e acumula check-ins e ajustes', () => {
  const now = new Date('2026-11-09T10:00:00Z');
  let f = mesclarFicha({ peso_inicial_kg: 86, mapa: { acorda: '6:00' } }, { mapa: { deita: '22:30' }, novo_checkin: { semana: 1, peso: 83.1 }, novo_ajuste: 'lanche 15:30' }, now);
  f = mesclarFicha(f, { peso_atual_kg: 83.1, novo_checkin: { semana: 2, peso: 82 } }, now);
  assert.deepEqual(f.mapa, { acorda: '6:00', deita: '22:30' });
  assert.equal(f.checkins.length, 2);
  assert.equal(f.ultimo_checkin.semana, 2);
  assert.equal(f.ajustes[0].ajuste, 'lanche 15:30');
  assert.equal(f.peso_atual_kg, 83.1);
});

test('API: regras de acesso (sem login, sem compra, vencida, sem consentimento, ok)', async () => {
  const deps = novasDeps();
  const msg = { bot: 'ju', message: 'oi' };
  assert.equal((await chamar(chat, { method: 'POST', body: msg })).status, 401);
  let r = await chamar(chat, { method: 'POST', email: 'ninguem@x.com', body: msg });
  assert.deepEqual([r.status, r.json.motivo], [403, 'nao_compradora']);
  r = await chamar(chat, { method: 'POST', email: 'bia@teste.com', body: msg });
  assert.deepEqual([r.status, r.json.motivo], [403, 'sem_produto']);
  r = await chamar(chat, { method: 'POST', email: 'carla@teste.com', body: msg });
  assert.deepEqual([r.status, r.json.motivo], [403, 'expirado']);
  r = await chamar(chat, { method: 'POST', email: 'ana@teste.com', body: msg });
  assert.deepEqual([r.status, r.json.erro], [403, 'sem_consentimento']);
  await deps.db.addConsent('ana@teste.com', CONSENT_VERSION);
  r = await chamar(chat, { method: 'POST', email: 'ana@teste.com', body: msg });
  assert.equal(r.status, 200);
  assert.ok(r.json.reply.length > 10);
  r = await chamar(chat, { method: 'POST', email: 'ana@teste.com', body: { bot: 'equipe', message: 'oi' } });
  assert.equal(r.status, 404, 'chat da equipe ainda desligado');
  r = await chamar(chat, { method: 'POST', email: 'ana@teste.com', body: { bot: 'ju', message: '   ' } });
  assert.equal(r.status, 400);
});

test('API: primeira abertura cria a saudação com aviso de IA', async () => {
  const deps = novasDeps();
  await deps.db.addConsent('ana@teste.com', CONSENT_VERSION);
  const r = await chamar(history, { email: 'ana@teste.com', query: { bot: 'ju' } });
  assert.equal(r.json.mensagens.length, 1);
  assert.match(r.json.mensagens[0].content, /assistente virtual com inteligência artificial/);
  assert.match(r.json.mensagens[0].content, /nome e quantos anos/);
  const r2 = await chamar(history, { email: 'ana@teste.com', query: { bot: 'ju' } });
  assert.equal(r2.json.mensagens.length, 1, 'não duplica a saudação');
});

test('API: erro do modelo vira mensagem amigável e não salva nada', async () => {
  const deps = novasDeps({ async create() { throw new Error('Anthropic 529'); } });
  await deps.db.addConsent('ana@teste.com', CONSENT_VERSION);
  const r = await chamar(chat, { method: 'POST', email: 'ana@teste.com', body: { bot: 'ju', message: 'oi' } });
  assert.equal(r.status, 502);
  assert.match(r.json.mensagem, /Tente de novo/);
  assert.equal((await deps.db.listMessages('ana@teste.com', 'ju')).length, 0);
});

test('Anthropic: cabeçalhos certos e uma nova tentativa em sobrecarga (529)', async () => {
  process.env.ANTHROPIC_API_KEY = 'sk-teste';
  const { createAnthropicLlm } = await import('../lib/llm.js');
  const chamadas = [];
  const respostas = [
    { ok: false, status: 529, text: async () => 'overloaded' },
    { ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'oi' }] }) },
  ];
  const llm = createAnthropicLlm({ fetchImpl: async (url, init) => { chamadas.push({ url, init }); return respostas.shift(); } });
  const r = await llm.create({ model: 'm', max_tokens: 10, messages: [] });
  assert.equal(r.content[0].text, 'oi');
  assert.equal(chamadas.length, 2);
  assert.equal(chamadas[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(chamadas[0].init.headers['x-api-key'], 'sk-teste');
  assert.equal(chamadas[0].init.headers['anthropic-version'], '2023-06-01');
  const llm2 = createAnthropicLlm({ fetchImpl: async () => ({ ok: false, status: 400, text: async () => 'bad' }) });
  await assert.rejects(() => llm2.create({}), /Anthropic 400/);
  delete process.env.ANTHROPIC_API_KEY;
});
