// Marca uma solicitação como resolvida (ou reabre).
import { json, metodo, exigirAdmin, bodyOf } from '../../lib/http.js';

export default async function handler(req, res) {
  if (!metodo(req, res, 'POST')) return;
  const deps = exigirAdmin(req, res);
  if (!deps) return;
  const { id, status = 'resolvida' } = bodyOf(req) || {};
  if (!id || !['resolvida', 'aberta'].includes(status)) return json(res, 400, { erro: 'dados_invalidos' });
  try {
    const r = await deps.db.resolverSolicitacao(id, status);
    if (!r) return json(res, 404, { erro: 'nao_encontrada' });
    json(res, 200, { ok: true, solicitacao: r });
  } catch (e) {
    console.error('[admin/resolver]', e);
    json(res, 500, { erro: 'interno', mensagem: e.message });
  }
}
