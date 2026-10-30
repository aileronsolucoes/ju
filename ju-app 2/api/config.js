// Configuração pública do frontend.
import { env, isFake, CONSENT_VERSION } from '../lib/config.js';
import { json } from '../lib/http.js';

export default function handler(req, res) {
  json(res, 200, {
    fake: isFake(),
    appUrl: env('APP_URL', '#'),
    consentVersion: CONSENT_VERSION,
  });
}
