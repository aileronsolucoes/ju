// Solicitações: GET lista (reembolsos primeiro; ?status=aberta|resolvida|todas); POST marca como resolvida ou reabre.
// (Uma função só para caber no limite de 12 funções do plano grátis da Vercel.)
import { json, metodo, exigirAdmin, bodyOf } from '../../lib/http.js';

const ORDEM = { reembolso: 0, acesso: 1, outro: 2 };

export default async function handler(req, res) {
  if (!metodo(req, res, 'GET', 'POST')) return;
  const deps = exigirAdmin(req, res);
  if (!deps) return;
  if (req.method === 'POST') {
    const { id, status = 'resolvida' } = bodyOf(req) || {};
    if (!id || !['resolvida', 'aberta'].includes(status)) return json(res, 400, { erro: 'dados_invalidos' });
    try {
      const r = await deps.db.resolverSolicitacao(id, status);
      if (!r) return json(res, 404, { erro: 'nao_encontrada' });
      return json(res, 200, { ok: true, solicitacao: r });
    } catch (e) {
      console.error('[admin/resolver]', e);
      return json(res, 500, { erro: 'interno', mensagem: e.message });
    }
  }
  try {
    const status = req.query?.status === 'todas' ? undefined : req.query?.status || 'aberta';
    const rows = await deps.db.listSolicitacoes({ status });
    rows.sort((a, b) => (a.status === b.status ? 0 : a.status === 'aberta' ? -1 : 1) ||
      (ORDEM[a.tipo] ?? 9) - (ORDEM[b.tipo] ?? 9) || (b.criado_em > a.criado_em ? 1 : -1));
    json(res, 200, { solicitacoes: rows });
  } catch (e) {
    console.error('[admin/solicitacoes]', e);
    json(res, 500, { erro: 'interno', mensagem: e.message });
  }
}
