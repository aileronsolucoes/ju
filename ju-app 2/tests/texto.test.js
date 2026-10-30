import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderizar, dividirEmBaloes } from '../public/js/texto.js';

test('renderização escapa HTML e formata negrito e listas', () => {
  assert.equal(renderizar('<script>x</script>'), '<p>&lt;script&gt;x&lt;/script&gt;</p>');
  assert.equal(renderizar('**15 g** + 350 ml'), '<p><strong>15 g</strong> + 350 ml</p>');
  assert.equal(renderizar('1. a\n2. b'), '<ol><li>a</li><li>b</li></ol>');
  assert.equal(renderizar('- a\n- b'), '<ul><li>a</li><li>b</li></ul>');
  assert.equal(renderizar('linha 1\nlinha 2'), '<p>linha 1<br>linha 2</p>');
  assert.equal(renderizar('5 * 3 = 15'), '<p>5 * 3 = 15</p>');
});

test('resposta longa vira no máximo 3 balões, sem quebrar listas', () => {
  const t = 'Que semana! −2,9 kg.\n\nO seu protocolo da semana 2:\n1. Dose\n2. Horários\n\n3. Movimento\n\nObs.\n\nNa segunda, me conte.';
  const b = dividirEmBaloes(t);
  assert.equal(b.length, 3);
  assert.equal(b[0], 'Que semana! −2,9 kg.');
  assert.match(b[1], /O seu protocolo da semana 2:\n1\. Dose/);
  assert.match(b[1], /3\. Movimento/);
  assert.equal(b[2], 'Na segunda, me conte.');
  assert.deepEqual(dividirEmBaloes('oi'), ['oi']);
});
