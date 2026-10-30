// Utilitários HTTP comuns às funções da Vercel.
import { createHash, timingSafeEqual } from 'node:crypto';
import { env } from './config.js';
import { getDeps } from './deps.js';

export function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

export function bodyOf(req) {
  const b = req.body;
  if (b == null || b === '') return {};
  if (typeof b === 'string') {
    try { return JSON.parse(b); } catch { return b; }
  }
  if (Buffer.isBuffer(b)) {
    try { return JSON.parse(b.toString('utf8')); } catch { return b.toString('utf8'); }
  }
  return b;
}

export function metodo(req, res, ...permitidos) {
  if (permitidos.includes(req.method)) return true;
  res.setHeader('Allow', permitidos.join(', '));
  json(res, 405, { erro: 'metodo_nao_permitido' });
  return false;
}

// Identifica a aluna pelo token do login. Devolve {email, deps} ou responde 401.
export async function exigirAluna(req, res) {
  const deps = getDeps();
  const h = req.headers?.authorization || req.headers?.Authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  let email = null;
  if (token) {
    try { email = await deps.emailDoToken(token); } catch (e) { console.error('[auth]', e); }
  }
  if (!email) {
    json(res, 401, { erro: 'nao_autenticada', mensagem: 'Sua sessão expirou. Entre de novo com o seu e-mail.' });
    return null;
  }
  return { email, deps };
}

export function igualSeguro(a, b) {
  const ha = createHash('sha256').update(String(a)).digest();
  const hb = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

export function exigirAdmin(req, res) {
  const senha = env('ADMIN_PASSWORD');
  const enviada = req.headers?.['x-admin-password'] || '';
  if (!senha || senha.length < 8) {
    json(res, 503, { erro: 'admin_nao_configurado', mensagem: 'Defina ADMIN_PASSWORD (mínimo 8 caracteres) na Vercel.' });
    return null;
  }
  if (!enviada || !igualSeguro(enviada, senha)) {
    json(res, 401, { erro: 'senha_incorreta', mensagem: 'Senha incorreta.' });
    return null;
  }
  return getDeps();
}

export const ERRO_AMIGAVEL = 'Ops, tive um problema para responder agora. Tente de novo em alguns instantes.';
