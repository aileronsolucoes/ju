// Webhook genérico de vendas (Cakto, Kiwify, Hotmart e parecidos).
// URL: https://SEU-APP.vercel.app/api/webhook?secret=SEU_WEBHOOK_SECRET
import { json, bodyOf, igualSeguro } from '../lib/http.js';
import { env } from '../lib/config.js';
import { getDeps } from '../lib/deps.js';
import { lerWebhook, segredoRecebido } from '../lib/webhook-parse.js';
import { aplicarCompra } from '../lib/access.js';

export async function processarWebhook(db, body, headers = {}) {
  const w = lerWebhook(body, headers);
  const registrarDesconhecido = async (motivo) => {
    const raw = typeof body === 'string' ? body : JSON.stringify(body);
    await db.addSolicitacao({
      email: w.email || 'desconhecido',
      tipo: 'outro',
      produto: w.produtoNome || w.produtoId || null,
      mensagem: `Webhook não processado (${motivo}; plataforma: ${w.plataforma}; evento: ${w.eventoBruto || '?'}). Conteúdo: ${raw.slice(0, 1500)}`,
    });
    return { ok: true, acao: 'registrado_para_revisao', motivo };
  };

  if (w.evento === 'ignorado') return { ok: true, acao: 'ignorado', evento: w.eventoBruto };
  if (w.evento === 'desconhecido') return registrarDesconhecido('evento não identificado');
  if (!w.email) return registrarDesconhecido('e-mail não encontrado');
  if (!w.acesso) return registrarDesconhecido('produto não mapeado');

  const atual = await db.getCompradora(w.email);
  const extras = ['sustentar', 'pele_firme', 'cozinha_4s'];

  if (w.evento === 'aprovado') {
    let novo = { email: w.email };
    if (!atual?.nome && w.nome) novo.nome = w.nome;
    if (w.acesso === 'principal' || w.acesso === 'upsell1') {
      const ap = aplicarCompra(atual, w.acesso, w.dataCompra || new Date());
      novo = { ...novo, principal: ap.principal, upsell1: ap.upsell1, upsell1_desde: ap.upsell1_desde };
    } else if (extras.includes(w.acesso)) {
      novo.outros_produtos = [...new Set([...(atual?.outros_produtos || []), w.acesso])];
    }
    await db.upsertCompradora(novo);
    return { ok: true, acao: 'liberado', acesso: w.acesso, email: w.email };
  }

  // revogado (reembolso / chargeback)
  if (!atual) return { ok: true, acao: 'nada_a_revogar', email: w.email };
  const mud = { email: w.email };
  if (w.acesso === 'principal') mud.principal = false;
  else if (w.acesso === 'upsell1') mud.upsell1 = false;
  else mud.outros_produtos = (atual.outros_produtos || []).filter((p) => p !== w.acesso);
  await db.upsertCompradora(mud);
  return { ok: true, acao: 'revogado', acesso: w.acesso, email: w.email };
}

export default async function handler(req, res) {
  if (req.method === 'GET') return json(res, 200, { ok: true, mensagem: 'Webhook ativo. Envie as vendas por POST.' });
  if (req.method !== 'POST') return json(res, 405, { erro: 'metodo_nao_permitido' });
  const segredo = env('WEBHOOK_SECRET');
  const body = bodyOf(req);
  if (!segredo || !segredoRecebido(req, body).some((s) => igualSeguro(s, segredo))) {
    return json(res, 401, { erro: 'segredo_invalido' });
  }
  try {
    const r = await processarWebhook(getDeps().db, body, req.headers || {});
    json(res, 200, r);
  } catch (e) {
    console.error('[webhook]', e);
    json(res, 500, { erro: 'interno' });
  }
}
