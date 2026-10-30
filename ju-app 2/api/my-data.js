// LGPD: mostra à aluna o que está guardado sobre ela.
import { json, metodo, exigirAluna, ERRO_AMIGAVEL } from '../lib/http.js';

export default async function handler(req, res) {
  if (!metodo(req, res, 'GET')) return;
  const a = await exigirAluna(req, res);
  if (!a) return;
  try {
    const { db } = a.deps;
    const [ficha, consent, msgs] = await Promise.all([db.getFicha(a.email), db.getConsent(a.email), db.listMessages(a.email, 'ju', 1000)]);
    json(res, 200, { email: a.email, ficha: ficha || {}, consentimento: consent, total_mensagens: msgs.length });
  } catch (e) {
    console.error('[my-data]', e);
    json(res, 500, { erro: 'interno', mensagem: ERRO_AMIGAVEL });
  }
}
