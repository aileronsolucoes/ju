// LGPD: apaga conversas, ficha e consentimentos da aluna.
// Pedidos de reembolso (solicitacoes) e o cadastro da compra são mantidos para cumprir obrigações da venda.
import { json, metodo, exigirAluna, ERRO_AMIGAVEL } from '../lib/http.js';

export default async function handler(req, res) {
  if (!metodo(req, res, 'POST')) return;
  const a = await exigirAluna(req, res);
  if (!a) return;
  try {
    const apagados = await a.deps.db.deleteUserData(a.email);
    json(res, 200, { ok: true, apagados });
  } catch (e) {
    console.error('[delete]', e);
    json(res, 500, { erro: 'interno', mensagem: ERRO_AMIGAVEL });
  }
}
