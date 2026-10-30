// Regras de acesso de cada assistente.
import { JU_DIAS_ACESSO } from './config.js';
import { diasEntre } from './time.js';

/**
 * @returns {{ok: boolean, motivo?: 'nao_compradora'|'sem_produto'|'expirado', dias_restantes?: number, dia_acesso?: number}}
 */
export function checarAcesso(compradora, bot, now = new Date()) {
  if (!compradora) return { ok: false, motivo: 'nao_compradora' };
  if (bot === 'equipe') {
    return compradora.principal ? { ok: true } : { ok: false, motivo: 'sem_produto' };
  }
  if (bot === 'ju') {
    if (!compradora.upsell1) return { ok: false, motivo: 'sem_produto' };
    const desde = compradora.upsell1_desde || compradora.criado_em || now;
    const passados = diasEntre(desde, now);
    const restantes = Math.ceil(JU_DIAS_ACESSO - passados);
    if (restantes <= 0) return { ok: false, motivo: 'expirado', dias_restantes: 0 };
    return { ok: true, dias_restantes: Math.min(JU_DIAS_ACESSO, restantes), dia_acesso: Math.max(1, Math.floor(passados) + 1) };
  }
  return { ok: false, motivo: 'sem_produto' };
}

/**
 * Aplica uma compra ao cadastro existente. Recompra do 4S Consultório com acesso
 * vencido reinicia os 90 dias; com acesso ainda ativo mantém a data original.
 */
export function aplicarCompra(existente, tipo, quando = new Date()) {
  const base = existente ? { ...existente } : {};
  if (tipo === 'principal') base.principal = true;
  if (tipo === 'upsell1') {
    const ativo = existente && existente.upsell1 && checarAcesso(existente, 'ju', quando).ok;
    base.upsell1 = true;
    if (!ativo) base.upsell1_desde = new Date(quando).toISOString();
  }
  return base;
}
