// Importa compradoras a partir de um CSV colado ou enviado pelo painel.
import { json, metodo, exigirAdmin, bodyOf } from '../../lib/http.js';
import { linhasParaCompradoras } from '../../lib/csv.js';
import { aplicarCompra } from '../../lib/access.js';

export default async function handler(req, res) {
  if (!metodo(req, res, 'POST')) return;
  const deps = exigirAdmin(req, res);
  if (!deps) return;
  const b = bodyOf(req);
  const csv = typeof b === 'string' ? b : b?.csv;
  if (!csv || typeof csv !== 'string') return json(res, 400, { erro: 'csv_vazio', mensagem: 'Cole o conteúdo do CSV.' });
  try {
    const { validas, erros } = linhasParaCompradoras(csv);
    let importadas = 0;
    for (const v of validas) {
      const atual = await deps.db.getCompradora(v.email);
      const row = { email: v.email };
      if (v.nome) row.nome = v.nome;
      // CSV só concede acesso; para tirar acesso use o webhook de reembolso ou o Supabase.
      if (v.principal) row.principal = true;
      if (v.upsell1) {
        const quando = v.upsell1_desde || new Date();
        const ap = v.upsell1_desde ? { upsell1: true, upsell1_desde: v.upsell1_desde } : aplicarCompra(atual, 'upsell1', quando);
        row.upsell1 = true;
        row.upsell1_desde = ap.upsell1_desde ?? atual?.upsell1_desde;
      }
      await deps.db.upsertCompradora(row);
      importadas++;
    }
    json(res, 200, { ok: true, importadas, erros });
  } catch (e) {
    console.error('[admin/import]', e);
    json(res, 500, { erro: 'interno', mensagem: e.message });
  }
}
