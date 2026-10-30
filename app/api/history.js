// Histórico da conversa. Na primeira vez, a Ju já começa com a saudação.
import { json, metodo, exigirAluna, ERRO_AMIGAVEL } from '../lib/http.js';
import { BOTS } from '../lib/config.js';
import { situacao, saudacaoJu } from '../lib/aluna.js';

export default async function handler(req, res) {
  if (!metodo(req, res, 'GET')) return;
  const a = await exigirAluna(req, res);
  if (!a) return;
  const bot = req.query?.bot || 'ju';
  if (!BOTS[bot]?.enabled) return json(res, 404, { erro: 'bot_indisponivel', mensagem: 'Este chat ainda não está disponível.' });
  try {
    const { db } = a.deps;
    const s = await situacao(db, a.email, bot);
    if (!s.acesso.ok) return json(res, 403, { erro: 'sem_acesso', motivo: s.acesso.motivo });
    if (!s.consentiu) return json(res, 403, { erro: 'sem_consentimento' });
    let msgs = await db.listMessages(a.email, bot, 100);
    if (!msgs.length && bot === 'ju') {
      await db.addMessages([{ email: a.email, bot, role: 'assistant', content: saudacaoJu(s.compradora?.nome) }]);
      msgs = await db.listMessages(a.email, bot, 100);
    }
    json(res, 200, {
      mensagens: msgs.map((m) => ({ role: m.role, content: m.content, criado_em: m.criado_em })),
      dias_restantes: s.acesso.dias_restantes,
    });
  } catch (e) {
    console.error('[history]', e);
    json(res, 500, { erro: 'interno', mensagem: ERRO_AMIGAVEL });
  }
}
