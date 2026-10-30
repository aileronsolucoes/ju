// Lista de solicitações (reembolsos primeiro). ?status=aberta|resolvida|todas
import { json, metodo, exigirAdmin } from '../../lib/http.js';

const ORDEM = { reembolso: 0, acesso: 1, outro: 2 };

export default async function handler(req, res) {
  if (!metodo(req, res, 'GET')) return;
  const deps = exigirAdmin(req, res);
  if (!deps) return;
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
