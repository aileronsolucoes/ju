import './helpers.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerWebhook, classificarEvento, classificarProduto } from '../lib/webhook-parse.js';
import { processarWebhook } from '../api/webhook.js';
import webhook from '../api/webhook.js';
import { createMemoryDb } from '../lib/db-memory.js';
import { novasDeps, chamar } from './helpers.js';

const cakto = (evento = 'purchase_approved', produto = 'Protocolo 4S Consultório', status = 'paid') => ({
  secret: 'segredo-teste',
  event: evento,
  data: {
    id: 'abc', status, paidAt: '2026-10-20T13:00:00Z',
    customer: { name: 'Maria Silva', email: 'Maria@Email.com', phone: '61999999999' },
    product: { id: 'prd_1', name: produto },
  },
});
const kiwify = (status = 'paid', tipo = 'order_approved', produto = 'Protocolo Chia 4S') => ({
  order_id: 'k1', order_status: status, webhook_event_type: tipo,
  Product: { product_id: 'kp1', product_name: produto },
  Customer: { full_name: 'Joana Reis', email: 'joana@email.com' },
  created_at: '2026-10-21 10:00',
});
const hotmart = (evento = 'PURCHASE_APPROVED', produto = 'Protocolo 4S Consultório') => ({
  event: evento, version: '2.0.0',
  data: {
    product: { id: 123, name: produto },
    buyer: { email: 'lu@email.com', name: 'Luana Prado' },
    purchase: { status: evento.replace('PURCHASE_', ''), order_date: 1761000000000 },
  },
});

test('Cakto: compra aprovada do 4S Consultório libera a Ju', () => {
  const w = lerWebhook(cakto());
  assert.equal(w.plataforma, 'cakto');
  assert.equal(w.email, 'maria@email.com');
  assert.equal(w.nome, 'Maria Silva');
  assert.equal(w.acesso, 'upsell1');
  assert.equal(w.evento, 'aprovado');
  assert.equal(w.dataCompra, '2026-10-20T13:00:00.000Z');
});

test('Cakto: reembolso e chargeback revogam', () => {
  assert.equal(lerWebhook(cakto('refund', 'Protocolo 4S Consultório', 'refunded')).evento, 'revogado');
  assert.equal(lerWebhook(cakto('chargeback', 'Protocolo 4S Consultório', 'chargedback')).evento, 'revogado');
});

test('Kiwify: pago, reembolsado e chargeback', () => {
  const w = lerWebhook(kiwify());
  assert.equal(w.plataforma, 'kiwify');
  assert.equal(w.email, 'joana@email.com');
  assert.equal(w.nome, 'Joana Reis');
  assert.equal(w.acesso, 'principal');
  assert.equal(w.evento, 'aprovado');
  assert.equal(lerWebhook(kiwify('refunded', 'order_refunded')).evento, 'revogado');
  assert.equal(lerWebhook(kiwify('chargedback', 'chargeback')).evento, 'revogado');
  assert.equal(lerWebhook(kiwify('waiting_payment', 'pix_created')).evento, 'ignorado');
});

test('Hotmart: aprovado e reembolsado, com cabeçalho hottok', () => {
  const w = lerWebhook(hotmart(), { 'X-HOTMART-HOTTOK': 'x' });
  assert.equal(w.plataforma, 'hotmart');
  assert.equal(w.email, 'lu@email.com');
  assert.equal(w.acesso, 'upsell1');
  assert.equal(w.evento, 'aprovado');
  assert.equal(w.dataCompra, new Date(1761000000000).toISOString(), 'data em milissegundos');
  assert.equal(lerWebhook(hotmart('PURCHASE_REFUNDED')).evento, 'revogado');
  assert.equal(lerWebhook(hotmart('PURCHASE_BILLET_PRINTED')).evento, 'ignorado');
});

test('formato desconhecido: acha o e-mail em qualquer lugar e aceita texto', () => {
  const w = lerWebhook(JSON.stringify({ evento: 'venda aprovada', pedido: { contato: { email_cliente: 'x@y.com' } }, produto: { nome: '4S Consultório' } }));
  assert.equal(w.email, 'x@y.com');
  assert.equal(w.evento, 'aprovado');
  assert.equal(w.acesso, 'upsell1');
});

test('classificação de produtos e eventos', () => {
  assert.equal(classificarProduto(null, 'PROTOCOLO 4S CONSULTÓRIO'), 'upsell1');
  assert.equal(classificarProduto(null, 'Protocolo Chia 4S + bônus'), 'principal');
  assert.equal(classificarProduto(null, 'Protocolo Sustentar (5S)'), 'sustentar');
  assert.equal(classificarProduto(null, 'Outro produto'), null);
  assert.equal(classificarEvento(''), 'desconhecido');
  assert.equal(classificarEvento('purchase_refused'), 'ignorado');
});

test('processarWebhook: libera, mantém e revoga acessos', async () => {
  const db = createMemoryDb();
  let r = await processarWebhook(db, cakto());
  assert.equal(r.acao, 'liberado');
  let c = await db.getCompradora('maria@email.com');
  assert.equal(c.upsell1, true);
  assert.equal(c.nome, 'Maria Silva');
  assert.equal(c.upsell1_desde, '2026-10-20T13:00:00.000Z');

  await processarWebhook(db, cakto('purchase_approved', 'Protocolo Chia 4S'));
  c = await db.getCompradora('maria@email.com');
  assert.equal(c.principal, true);
  assert.equal(c.upsell1, true, 'comprar o principal não mexe no upsell');

  await processarWebhook(db, cakto('purchase_approved', 'Protocolo Sustentar (5S)'));
  c = await db.getCompradora('maria@email.com');
  assert.deepEqual(c.outros_produtos, ['sustentar']);

  r = await processarWebhook(db, cakto('refund', 'Protocolo 4S Consultório', 'refunded'));
  assert.equal(r.acao, 'revogado');
  c = await db.getCompradora('maria@email.com');
  assert.equal(c.upsell1, false);
  assert.equal(c.principal, true);
});

test('processarWebhook: payload estranho vira solicitação "outro" para revisão', async () => {
  const db = createMemoryDb();
  const r = await processarWebhook(db, { foo: 'bar', status: 'paid' });
  assert.equal(r.acao, 'registrado_para_revisao');
  const s = await db.listSolicitacoes();
  assert.equal(s.length, 1);
  assert.equal(s[0].tipo, 'outro');
  assert.match(s[0].mensagem, /Webhook não processado/);

  await processarWebhook(db, cakto('purchase_approved', 'Curso de crochê'));
  assert.equal((await db.listSolicitacoes()).length, 2);
  // eventos que só não interessam (pix gerado) não poluem a lista
  await processarWebhook(db, kiwify('waiting_payment', 'pix_created'));
  assert.equal((await db.listSolicitacoes()).length, 2);
});

test('handler: exige o segredo e aceita ?secret=, cabeçalho ou campo do corpo', async () => {
  const deps = novasDeps();
  let r = await chamar(webhook, { method: 'POST', body: { ...cakto(), secret: 'errado' } });
  assert.equal(r.status, 401);
  r = await chamar(webhook, { method: 'POST', query: { secret: 'segredo-teste' }, body: kiwify() });
  assert.equal(r.status, 200);
  assert.equal((await deps.db.getCompradora('joana@email.com')).principal, true);
  r = await chamar(webhook, { method: 'POST', headers: { 'x-hotmart-hottok': 'segredo-teste' }, body: hotmart() });
  assert.equal(r.json.acao, 'liberado');
  r = await chamar(webhook, { method: 'POST', body: cakto() });
  assert.equal(r.json.acao, 'liberado');
});
