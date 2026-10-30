// Entrar com o e-mail da compra (sem código). Devolve o token da sessão.
import { json, metodo, bodyOf } from '../lib/http.js';
import { criarToken } from '../lib/sessao.js';

export default async function handler(req, res) {
  if (!metodo(req, res, 'POST')) return;
  const email = String((bodyOf(req) || {}).email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return json(res, 400, { erro: 'email_invalido', mensagem: 'Digite um e-mail válido.' });
  }
  json(res, 200, { token: criarToken(email), email });
}
