// Situação da aluna: cadastro, acesso e consentimento.
import { checarAcesso } from './access.js';
import { CONSENT_VERSION } from './config.js';

export async function situacao(db, email, bot = 'ju', now = new Date()) {
  const [compradora, consent] = await Promise.all([db.getCompradora(email), db.getConsent(email)]);
  const acesso = checarAcesso(compradora, bot, now);
  return { compradora, acesso, consentiu: !!(consent && consent.versao === CONSENT_VERSION), consent };
}

export function saudacaoJu(nome) {
  const primeiro = (nome || '').trim().split(/\s+/)[0];
  return [
    `Oi${primeiro ? `, ${primeiro}` : ''}! Eu sou a **Ju**, uma assistente virtual com inteligência artificial. A Juliana me treinou para te acompanhar no protocolo pelos próximos 90 dias.`,
    'Não sou médica. Quando for caso de médico, eu te aviso. Pode escrever do seu jeito, eu entendo.',
    'Pra começar: qual é o seu nome e quantos anos você tem?',
  ].join('\n\n');
}
