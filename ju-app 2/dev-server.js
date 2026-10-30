// Servidor local: serve public/ e monta as funções de /api como a Vercel faria.
//   DEV_FAKE=1 node dev-server.js   -> tudo simulado (login com código 123456, IA de mentira)
//   node dev-server.js              -> serviços reais, lendo .env.local
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3000);

// Carrega .env.local (modo real)
const envFile = path.join(ROOT, '.env.local');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const FAKE = process.env.DEV_FAKE === '1';
if (FAKE) {
  process.env.ADMIN_PASSWORD ||= 'admin-teste-123';
  process.env.WEBHOOK_SECRET ||= 'segredo-teste';
  process.env.APP_URL ||= 'https://exemplo.com/area-da-aluna';
}

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};

async function lerCorpo(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  const ct = req.headers['content-type'] || '';
  if (!raw) return undefined;
  if (ct.includes('application/json')) {
    try { return JSON.parse(raw); } catch { return raw; }
  }
  if (ct.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(raw));
  return raw;
}

function enviarJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

async function rotaDev(req, res, url) {
  const { getDeps, setDeps, seedFake } = await import('./lib/deps.js');
  const body = (await lerCorpo(req)) || {};
  if (url.pathname === '/api/dev/send-code') {
    console.log(`[dev] código para ${body.email}: 123456`);
    return enviarJson(res, 200, { ok: true });
  }
  if (url.pathname === '/api/dev/verify') {
    if (String(body.code) !== '123456') return enviarJson(res, 400, { erro: 'codigo_invalido' });
    return enviarJson(res, 200, { token: `fake:${String(body.email).trim().toLowerCase()}` });
  }
  if (url.pathname === '/api/dev/reset') {
    const { createMemoryDb } = await import('./lib/db-memory.js');
    const d = getDeps();
    setDeps({ ...d, db: createMemoryDb(seedFake()) });
    return enviarJson(res, 200, { ok: true });
  }
  return enviarJson(res, 404, { erro: 'nao_encontrado' });
}

async function rotaApi(req, res, url) {
  if (url.pathname.startsWith('/api/dev/')) {
    if (!FAKE) return enviarJson(res, 404, { erro: 'nao_encontrado' });
    return rotaDev(req, res, url);
  }
  const rel = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '');
  if (!/^[a-z0-9\-/]+$/i.test(rel)) return enviarJson(res, 404, { erro: 'nao_encontrado' });
  const file = path.join(ROOT, 'api', `${rel}.js`);
  if (!existsSync(file)) return enviarJson(res, 404, { erro: 'nao_encontrado' });
  const mod = await import(pathToFileURL(file).href);
  req.query = Object.fromEntries(url.searchParams);
  req.body = await lerCorpo(req);
  try {
    await mod.default(req, res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) enviarJson(res, 500, { erro: 'interno' });
  }
}

async function rotaEstatica(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') {
    res.writeHead(302, { Location: '/ju' });
    return res.end();
  }
  let file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  // cleanUrls: /ju -> ju.html
  if (!path.extname(file) && existsSync(`${file}.html`)) file = `${file}.html`;
  try {
    const st = await stat(file);
    if (st.isDirectory()) file = path.join(file, 'index.html');
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Página não encontrada');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) return rotaApi(req, res, url);
  return rotaEstatica(req, res, url);
});

server.listen(PORT, () => {
  console.log(`Chia 4S Assist rodando em http://localhost:${PORT}/ju  (${FAKE ? 'modo de teste DEV_FAKE: código 123456' : 'modo real'})`);
  if (FAKE) console.log('Contas de teste: ana@teste.com (com Ju), bia@teste.com (sem Ju), carla@teste.com (Ju vencida). Admin: /admin senha admin-teste-123');
});
