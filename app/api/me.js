// Quem é a aluna logada e o que ela pode acessar.
import { json, metodo, exigirAluna, ERRO_AMIGAVEL } from '../lib/http.js';
import { situacao } from '../lib/aluna.js';
import { checarAcesso } from '../lib/access.js';

export default async function handler(req, res) {
  if (!metodo(req, res, 'GET')) return;
  const a = await exigirAluna(req, res);
  if (!a) return;
  try {
    const s = await situacao(a.deps.db, a.email, 'ju');
    const c = s.compradora;
    json(res, 200, {
      email: a.email,
      nome: c?.nome || null,
      principal: !!c?.principal,
      upsell1: !!c?.upsell1,
      ju: s.acesso,
      equipe: checarAcesso(c, 'equipe'),
      dias_restantes_ju: s.acesso.dias_restantes ?? 0,
      consent: s.consentiu,
    });
  } catch (e) {
    console.error('[me]', e);
    json(res, 500, { erro: 'interno', mensagem: ERRO_AMIGAVEL });
  }
}
