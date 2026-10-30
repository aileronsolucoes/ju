// Importação de compradoras por CSV (colunas: email,nome,principal,upsell1[,upsell1_desde]).
// Aceita vírgula ou ponto e vírgula (Excel em português), aspas e cabeçalho opcional.

export function parseCsv(texto) {
  const linhas = String(texto || '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!linhas.length) return [];
  const sep = (linhas[0].match(/;/g) || []).length > (linhas[0].match(/,/g) || []).length ? ';' : ',';
  return linhas.map((linha) => {
    const cells = [];
    let cur = '';
    let q = false;
    for (let i = 0; i < linha.length; i++) {
      const ch = linha[i];
      if (q) {
        if (ch === '"' && linha[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === sep) { cells.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  });
}

const VERDADE = new Set(['1', 'sim', 's', 'true', 'x', 'yes', 'y', 'verdadeiro', 'ok']);
export const bool = (v) => VERDADE.has(String(v ?? '').trim().toLowerCase());

function dataBr(v) {
  const s = String(v || '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const d = m ? new Date(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T12:00:00-03:00`) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function linhasParaCompradoras(texto) {
  const rows = parseCsv(texto);
  if (!rows.length) return { validas: [], erros: [] };
  let cols = ['email', 'nome', 'principal', 'upsell1', 'upsell1_desde'];
  let inicio = 0;
  const cab = rows[0].map((c) => c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));
  if (cab.some((c) => c.includes('mail'))) {
    cols = cab.map((c) => (c.includes('mail') ? 'email' : c.includes('desde') || c.includes('data') ? 'upsell1_desde' : c.includes('upsell') || c.includes('consultorio') ? 'upsell1' : c.includes('principal') ? 'principal' : c.includes('nome') ? 'nome' : c));
    inicio = 1;
  }
  const validas = [];
  const erros = [];
  for (let i = inicio; i < rows.length; i++) {
    const o = Object.fromEntries(cols.map((c, j) => [c, rows[i][j]]));
    const email = String(o.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      erros.push({ linha: i + 1, motivo: `e-mail inválido: "${o.email || ''}"` });
      continue;
    }
    validas.push({
      email,
      nome: o.nome ? String(o.nome).slice(0, 120) : undefined,
      principal: bool(o.principal),
      upsell1: bool(o.upsell1),
      upsell1_desde: dataBr(o.upsell1_desde),
    });
  }
  return { validas, erros };
}
