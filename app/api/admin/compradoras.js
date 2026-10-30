// Busca de compradoras por e-mail ou nome.
import { json, metodo, exigirAdmin } from '../../lib/http.js';
import { checarAcesso } from '../../lib/access.js';

export default async function handler(req, res) {
  if (!metodo(req, res, 'GET')) return;
  const deps = exigirAdmin(req, res);
  if (!deps) return;
  try {
    const rows = await deps.db.searchCompradoras(String(req.query?.q || ''), 100);
    json(res, 200, { compradoras: rows.map((c) => ({ ...c, ju: checarAcesso(c, 'ju') })) });
  } catch (e) {
    console.error('[admin/compradoras]', e);
    json(res, 500, { erro: 'interno', mensagem: e.message });
  }
}
