// Sessão da aluna sem senha e sem código: ela entra só com o e-mail da compra.
// O servidor devolve um token assinado (HMAC) que fica guardado no celular dela.
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { env, isFake } from './config.js';
const igualSeguro = (a, b) => timingSafeEqual(createHash('sha256').update(String(a)).digest(), createHash('sha256').update(String(b)).digest());

const DIAS = 180;

function segredo() {
  const s = env('SESSION_SECRET') || env('SUPABASE_SERVICE_ROLE_KEY') || (isFake() ? 'segredo-de-teste' : '');
  if (!s) throw new Error('Defina SESSION_SECRET ou SUPABASE_SERVICE_ROLE_KEY');
  return s;
}
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64url');
const assinar = (dados) => createHmac('sha256', segredo()).update(dados).digest('base64url');

export function criarToken(email, now = Date.now()) {
  const exp = Math.floor(now / 1000) + DIAS * 86400;
  const dados = `v1.${b64(String(email).trim().toLowerCase())}.${exp}`;
  return `${dados}.${assinar(dados)}`;
}

export function lerToken(token, now = Date.now()) {
  const partes = String(token || '').split('.');
  if (partes.length !== 4 || partes[0] !== 'v1') return null;
  const [, em, exp, sig] = partes;
  if (!igualSeguro(sig, assinar(`v1.${em}.${exp}`))) return null;
  if (Number(exp) * 1000 < now) return null;
  const email = Buffer.from(em, 'base64url').toString('utf8');
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
