import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarToken, lerToken } from '../lib/sessao.js';
import entrar from '../api/entrar.js';
import { chamar } from './helpers.js';

test('sessão: token assinado guarda o e-mail e recusa adulteração e validade vencida', () => {
  const t = criarToken('Ana@Teste.com');
  assert.equal(lerToken(t), 'ana@teste.com');
  const [v, em, exp, sig] = t.split('.');
  const outro = Buffer.from('bia@teste.com').toString('base64url');
  assert.equal(lerToken(`${v}.${outro}.${exp}.${sig}`), null, 'trocar o e-mail invalida');
  assert.equal(lerToken(`${v}.${em}.${Number(exp) + 10}.${sig}`), null, 'trocar a validade invalida');
  assert.equal(lerToken('qualquer-coisa'), null);
  assert.equal(lerToken(t, Date.now() + 181 * 86400000), null, 'vence em 180 dias');
});

test('API entrar: só com o e-mail, valida o formato', async () => {
  let r = await chamar(entrar, { method: 'POST', body: { email: 'sem-arroba' } });
  assert.equal(r.status, 400);
  r = await chamar(entrar, { method: 'POST', body: { email: ' Ana@Teste.com ' } });
  assert.equal(r.status, 200);
  assert.equal(r.json.email, 'ana@teste.com');
  assert.equal(lerToken(r.json.token), 'ana@teste.com');
});
