// Datas no fuso de Brasília.
const TZ = 'America/Sao_Paulo';

export function diaSP(date = new Date()) {
  // YYYY-MM-DD no fuso de Brasília
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  return p;
}

export function dataLongaSP(date = new Date()) {
  const s = new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ, weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(date);
  return s;
}

const DIA_MS = 24 * 60 * 60 * 1000;
export const addDias = (date, n) => new Date(new Date(date).getTime() + n * DIA_MS);
export const diasEntre = (a, b) => (new Date(b).getTime() - new Date(a).getTime()) / DIA_MS;
