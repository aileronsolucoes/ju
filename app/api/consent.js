// Registra o consentimento LGPD da aluna.
import { json, metodo, exigirAluna, bodyOf, ERRO_AMIGAVEL } from '../lib/http.js';
import { CONSENT_VERSION } from '../lib/config.js';

export default async function handler(req, res) {
  if (!metodo(req, res, 'POST')) return;
  const a = await exigirAluna(req, res);
  if (!a) return;
  const { versao } = bodyOf(req) || {};
  if (versao !== CONSENT_VERSION) return json(res, 400, { erro: 'versao_invalida', mensagem: 'Atualize a página e tente de novo.' });
  try {
    await a.deps.db.addConsent(a.email, versao);
    json(res, 200, { ok: true });
  } catch (e) {
    console.error('[consent]', e);
    json(res, 500, { erro: 'interno', mensagem: ERRO_AMIGAVEL });
  }
}
