// Envia uma mensagem para a assistente e devolve a resposta.
import { json, metodo, exigirAluna, bodyOf, ERRO_AMIGAVEL } from '../lib/http.js';
import { BOTS, MAX_MSG_CHARS } from '../lib/config.js';
import { situacao } from '../lib/aluna.js';
import { consumirMensagem } from '../lib/ratelimit.js';
import { rodarConversa } from '../lib/chat.js';

export default async function handler(req, res) {
  if (!metodo(req, res, 'POST')) return;
  const a = await exigirAluna(req, res);
  if (!a) return;
  const { bot = 'ju', message } = bodyOf(req) || {};
  if (!BOTS[bot]?.enabled) return json(res, 404, { erro: 'bot_indisponivel', mensagem: 'Este chat ainda não está disponível.' });
  const texto = typeof message === 'string' ? message.trim() : '';
  if (!texto) return json(res, 400, { erro: 'mensagem_vazia', mensagem: 'Escreva uma mensagem.' });
  if (texto.length > MAX_MSG_CHARS) {
    return json(res, 400, { erro: 'mensagem_longa', mensagem: `A mensagem passou de ${MAX_MSG_CHARS} caracteres. Divida em partes, por favor.` });
  }
  const { db, llm } = a.deps;
  try {
    const s = await situacao(db, a.email, bot);
    if (!s.acesso.ok) return json(res, 403, { erro: 'sem_acesso', motivo: s.acesso.motivo });
    if (!s.consentiu) return json(res, 403, { erro: 'sem_consentimento' });
    const lim = await consumirMensagem(db, a.email, bot);
    if (!lim.ok) {
      return json(res, 429, {
        erro: 'limite_diario',
        mensagem: `Você chegou ao limite de ${lim.limite} mensagens de hoje. Amanhã a gente continua!`,
      });
    }
    const r = await rodarConversa({ bot, email: a.email, mensagem: texto, compradora: s.compradora, acesso: s.acesso, db, llm });
    json(res, 200, { reply: r.reply });
  } catch (e) {
    console.error('[chat]', e);
    json(res, 502, { erro: 'falha_modelo', mensagem: ERRO_AMIGAVEL });
  }
}
