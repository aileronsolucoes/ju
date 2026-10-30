import { novasDeps, chamar } from './helpers.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consumirMensagem } from '../lib/ratelimit.js';
import { createMemoryDb } from '../lib/db-memory.js';
import chat from '../api/chat.js';

test('limite diário: 80 mensagens da Ju por dia, zera no dia seguinte', async () => {
  const db = createMemoryDb();
  const hoje = new Date('2026-10-29T12:00:00-03:00');
  for (let i = 1; i <= 80; i++) assert.equal((await consumirMensagem(db, 'a@a.com', 'ju', hoje)).ok, true);
  const r = await consumirMensagem(db, 'a@a.com', 'ju', hoje);
  assert.deepEqual([r.ok, r.usadas, r.limite], [false, 81, 80]);
  // outra aluna não é afetada
  assert.equal((await consumirMensagem(db, 'b@b.com', 'ju', hoje)).ok, true);
  // dia seguinte (fuso de Brasília)
  assert.equal((await consumirMensagem(db, 'a@a.com', 'ju', new Date('2026-10-30T00:30:00-03:00'))).ok, true);
});

test('o dia vira à meia-noite de Brasília, não em UTC', async () => {
  const db = createMemoryDb();
  const lim = { ju: 1 };
  assert.equal((await consumirMensagem(db, 'a@a.com', 'ju', new Date('2026-10-29T23:30:00-03:00'), lim)).ok, true);
  // 02:30 UTC do dia 30 ainda é dia 29 em Brasília
  assert.equal((await consumirMensagem(db, 'a@a.com', 'ju', new Date('2026-10-30T02:30:00Z'), lim)).ok, false);
});

test('API devolve 429 com mensagem amigável quando passa do limite', async () => {
  const deps = novasDeps();
  await deps.db.addConsent('ana@teste.com', (await import('../lib/config.js')).CONSENT_VERSION);
  const { diaSP } = await import('../lib/time.js');
  for (let i = 0; i < 80; i++) await deps.db.incrementUso('ana@teste.com', 'ju', diaSP());
  const r = await chamar(chat, { method: 'POST', email: 'ana@teste.com', body: { bot: 'ju', message: 'oi' } });
  assert.equal(r.status, 429);
  assert.match(r.json.mensagem, /limite de 80 mensagens/);
});
