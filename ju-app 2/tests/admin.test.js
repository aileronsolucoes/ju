import { novasDeps, chamar } from './helpers.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linhasParaCompradoras } from '../lib/csv.js';
import imp from '../api/admin/import.js';
import sol from '../api/admin/solicitacoes.js';
import resolver from '../api/admin/resolver.js';
import comp from '../api/admin/compradoras.js';

const H = { 'x-admin-password': 'senha-de-teste-123' };

test('CSV: vírgula ou ponto e vírgula, aspas, sim/não e erros por linha', () => {
  const { validas, erros } = linhasParaCompradoras('﻿E-mail;Nome;Principal;Upsell1;Upsell1_desde\nMaria@X.com;"Silva; Maria";sim;sim;20/10/2026\nerrado;Fulana;1;0;\njo@y.com;Jo;não;x;');
  assert.equal(validas.length, 2);
  assert.deepEqual(validas[0], { email: 'maria@x.com', nome: 'Silva; Maria', principal: true, upsell1: true, upsell1_desde: '2026-10-20T15:00:00.000Z' });
  assert.equal(validas[1].upsell1, true);
  assert.equal(validas[1].principal, false);
  assert.equal(erros[0].linha, 3);
  const sem = linhasParaCompradoras('a@a.com,Ana,1,1');
  assert.equal(sem.validas[0].email, 'a@a.com');
});

test('painel: senha obrigatória, importação, busca e resolução de solicitações', async () => {
  const deps = novasDeps();
  assert.equal((await chamar(sol, { headers: { 'x-admin-password': 'errada' } })).status, 401);
  let r = await chamar(imp, { method: 'POST', headers: H, body: { csv: 'email,nome,principal,upsell1\nnova@x.com,Nova,sim,sim\nbad,X,1,1' } });
  assert.deepEqual([r.json.importadas, r.json.erros.length], [1, 1]);
  r = await chamar(comp, { headers: H, query: { q: 'nova' } });
  assert.equal(r.json.compradoras[0].ju.ok, true);
  assert.equal(r.json.compradoras[0].ju.dias_restantes, 90);

  await deps.db.addSolicitacao({ email: 'a@x.com', tipo: 'outro', mensagem: 'x' });
  await deps.db.addSolicitacao({ email: 'b@x.com', tipo: 'reembolso', mensagem: 'y' });
  r = await chamar(sol, { headers: H });
  assert.deepEqual(r.json.solicitacoes.map((s) => s.tipo), ['reembolso', 'outro'], 'reembolsos primeiro');
  r = await chamar(resolver, { method: 'POST', headers: H, body: { id: r.json.solicitacoes[0].id } });
  assert.equal(r.json.solicitacao.status, 'resolvida');
  r = await chamar(sol, { headers: H });
  assert.equal(r.json.solicitacoes.length, 1);
});
