import './helpers.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checarAcesso, aplicarCompra } from '../lib/access.js';

const agora = new Date('2026-10-29T15:00:00Z');
const diasAtras = (n) => new Date(agora.getTime() - n * 86400000).toISOString();

test('sem cadastro: não é compradora', () => {
  assert.deepEqual(checarAcesso(null, 'ju', agora), { ok: false, motivo: 'nao_compradora' });
});

test('só o produto principal: sem Ju, com chat da equipe', () => {
  const c = { principal: true, upsell1: false };
  assert.equal(checarAcesso(c, 'ju', agora).motivo, 'sem_produto');
  assert.equal(checarAcesso(c, 'equipe', agora).ok, true);
});

test('upsell1 sem o principal: Ju liberada, equipe não', () => {
  const c = { principal: false, upsell1: true, upsell1_desde: diasAtras(1) };
  assert.equal(checarAcesso(c, 'ju', agora).ok, true);
  assert.equal(checarAcesso(c, 'equipe', agora).ok, false);
});

test('Ju: 90 dias contados da compra', () => {
  const r0 = checarAcesso({ upsell1: true, upsell1_desde: diasAtras(0) }, 'ju', agora);
  assert.deepEqual([r0.ok, r0.dias_restantes, r0.dia_acesso], [true, 90, 1]);
  const r89 = checarAcesso({ upsell1: true, upsell1_desde: diasAtras(89.5) }, 'ju', agora);
  assert.deepEqual([r89.ok, r89.dias_restantes, r89.dia_acesso], [true, 1, 90]);
  const r90 = checarAcesso({ upsell1: true, upsell1_desde: diasAtras(90) }, 'ju', agora);
  assert.deepEqual([r90.ok, r90.motivo], [false, 'expirado']);
  assert.equal(checarAcesso({ upsell1: true, upsell1_desde: diasAtras(200) }, 'ju', agora).motivo, 'expirado');
});

test('recompra: mantém a data se o acesso está ativo; reinicia se venceu', () => {
  const ativo = { email: 'a@a.com', upsell1: true, upsell1_desde: diasAtras(10) };
  assert.equal(aplicarCompra(ativo, 'upsell1', agora).upsell1_desde, ativo.upsell1_desde);
  const vencido = { email: 'a@a.com', upsell1: true, upsell1_desde: diasAtras(120) };
  assert.equal(aplicarCompra(vencido, 'upsell1', agora).upsell1_desde, agora.toISOString());
  const revogado = { email: 'a@a.com', upsell1: false, upsell1_desde: diasAtras(10) };
  assert.equal(aplicarCompra(revogado, 'upsell1', agora).upsell1_desde, agora.toISOString());
});
