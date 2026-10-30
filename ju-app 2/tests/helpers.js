// Utilitários de teste: req/res falsos no formato das funções da Vercel e dependências em memória.
process.env.DEV_FAKE = '1';
process.env.FAKE_DELAY_MS = '0';
process.env.ADMIN_PASSWORD = 'senha-de-teste-123';
process.env.WEBHOOK_SECRET = 'segredo-teste';

import { createMemoryDb } from '../lib/db-memory.js';
import { createFakeLlm } from '../lib/llm.js';
import { setDeps, seedFake } from '../lib/deps.js';

export function novasDeps(llm = createFakeLlm({ delayMs: 0 })) {
  const deps = {
    fake: true,
    db: createMemoryDb(seedFake()),
    llm,
    async emailDoToken(t) { return t && t.startsWith('fake:') ? t.slice(5) : null; },
  };
  setDeps(deps);
  return deps;
}

export async function chamar(handler, { method = 'GET', headers = {}, query = {}, body, email } = {}) {
  const req = { method, headers: { ...headers, ...(email ? { authorization: `Bearer fake:${email}` } : {}) }, query, body };
  const res = {
    statusCode: 200, headers: {}, corpo: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(s) { this.corpo = s || ''; this.terminou = true; },
  };
  await handler(req, res);
  let json = null;
  try { json = JSON.parse(res.corpo); } catch { /* não JSON */ }
  return { status: res.statusCode, json };
}
