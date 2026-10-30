// Limite simples de mensagens por dia (fuso de Brasília).
import { LIMITES_DIARIOS } from './config.js';
import { diaSP } from './time.js';

export async function consumirMensagem(db, email, bot, now = new Date(), limites = LIMITES_DIARIOS) {
  const dia = diaSP(now);
  const usadas = await db.incrementUso(email, bot, dia);
  const limite = limites[bot] ?? 50;
  return { ok: usadas <= limite, usadas, limite };
}
