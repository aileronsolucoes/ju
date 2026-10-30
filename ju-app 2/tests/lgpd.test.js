import { novasDeps, chamar } from './helpers.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONSENT_VERSION } from '../lib/config.js';
import consent from '../api/consent.js';
import del from '../api/delete-my-data.js';
import myData from '../api/my-data.js';
import chat from '../api/chat.js';

test('LGPD: consentimento, ver dados e apagar tudo (só da própria aluna)', async () => {
  const deps = novasDeps();
  const db = deps.db;
  let r = await chamar(consent, { method: 'POST', email: 'ana@teste.com', body: { versao: 'velha' } });
  assert.equal(r.status, 400);
  r = await chamar(consent, { method: 'POST', email: 'ana@teste.com', body: { versao: CONSENT_VERSION } });
  assert.equal(r.status, 200);
  await chamar(chat, { method: 'POST', email: 'ana@teste.com', body: { bot: 'ju', message: 'meu peso é 80 kg' } });
  await chamar(chat, { method: 'POST', email: 'ana@teste.com', body: { bot: 'ju', message: 'quero falar com uma pessoa' } });
  // outra aluna com dados próprios
  await db.addConsent('outra@x.com', CONSENT_VERSION);
  await db.addMessages([{ email: 'outra@x.com', bot: 'ju', role: 'user', content: 'oi' }]);
  await db.saveFicha('outra@x.com', { peso_inicial_kg: 70 });

  r = await chamar(myData, { email: 'ana@teste.com' });
  assert.equal(r.json.ficha.peso_inicial_kg, 80);
  assert.equal(r.json.total_mensagens, 4);

  r = await chamar(del, { method: 'POST', email: 'ana@teste.com' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.apagados, { conversas: 4, fichas: 1, consentimentos: 1 });
  assert.equal((await db.listMessages('ana@teste.com', 'ju')).length, 0);
  assert.equal(await db.getFicha('ana@teste.com'), null);
  assert.equal(await db.getConsent('ana@teste.com'), null);
  // pedido registrado e cadastro continuam
  assert.equal((await db.listSolicitacoes()).filter((s) => s.email === 'ana@teste.com').length, 1);
  assert.ok(await db.getCompradora('ana@teste.com'));
  // a outra aluna não é afetada
  assert.equal((await db.listMessages('outra@x.com', 'ju')).length, 1);
  assert.deepEqual(await db.getFicha('outra@x.com'), { peso_inicial_kg: 70 });
  // depois de apagar, precisa consentir de novo para conversar
  r = await chamar(chat, { method: 'POST', email: 'ana@teste.com', body: { bot: 'ju', message: 'oi' } });
  assert.equal(r.json.erro, 'sem_consentimento');
  // sem login não apaga nada
  assert.equal((await chamar(del, { method: 'POST' })).status, 401);
});
