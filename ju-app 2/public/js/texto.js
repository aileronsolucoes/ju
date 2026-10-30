// Formatação das mensagens: escapa HTML, negrito, listas e quebras de linha.
// Também divide a resposta da Ju em 2-3 balões curtos, como alguém digitando.

export function escapar(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function inline(s) {
  return escapar(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*(\S(?:[^*\n]*?\S)?)\*(?=[\s).,!?:;]|$)/g, '$1<strong>$2</strong>')
    .replace(/(^|[\s(])_(\S(?:[^_\n]*?\S)?)_(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>');
}

const RE_UL = /^\s*[-•*]\s+(.*)$/;
const RE_OL = /^\s*(\d+)[.)]\s+(.*)$/;
const RE_TITULO = /^\s*#{1,6}\s+(.*)$/;

export function renderizar(texto) {
  const linhas = String(texto || '').replace(/\r/g, '').split('\n');
  const out = [];
  let lista = null; // {tipo, itens, inicio}
  let par = [];
  const fecharPar = () => {
    if (par.length) out.push(`<p>${par.join('<br>')}</p>`);
    par = [];
  };
  const fecharLista = () => {
    if (!lista) return;
    const start = lista.tipo === 'ol' && lista.inicio !== 1 ? ` start="${lista.inicio}"` : '';
    out.push(`<${lista.tipo}${start}>${lista.itens.map((i) => `<li>${i}</li>`).join('')}</${lista.tipo}>`);
    lista = null;
  };
  for (const l of linhas) {
    let m;
    if (!l.trim()) { fecharPar(); fecharLista(); continue; }
    if ((m = l.match(RE_OL))) {
      fecharPar();
      if (!lista || lista.tipo !== 'ol') { fecharLista(); lista = { tipo: 'ol', itens: [], inicio: Number(m[1]) }; }
      lista.itens.push(inline(m[2]));
    } else if ((m = l.match(RE_UL))) {
      fecharPar();
      if (!lista || lista.tipo !== 'ul') { fecharLista(); lista = { tipo: 'ul', itens: [] }; }
      lista.itens.push(inline(m[1]));
    } else if (lista && /^\s{2,}\S/.test(l)) {
      // continuação de item de lista
      lista.itens[lista.itens.length - 1] += `<br>${inline(l.trim())}`;
    } else if ((m = l.match(RE_TITULO))) {
      fecharLista();
      par.push(`<strong>${inline(m[1])}</strong>`);
    } else {
      fecharLista();
      par.push(inline(l));
    }
  }
  fecharPar();
  fecharLista();
  return out.join('');
}

const ehLista = (p) => RE_UL.test(p.split('\n')[0]) || RE_OL.test(p.split('\n')[0]);

// Divide em até `max` balões, nos parágrafos (linhas em branco), sem quebrar listas.
export function dividirEmBaloes(texto, max = 3) {
  const paras = String(texto || '').replace(/\r/g, '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const blocos = [];
  for (const p of paras) {
    const ant = blocos[blocos.length - 1];
    // itens de lista separados por linha em branco continuam no mesmo balão
    if (ant && ehLista(p) && ehLista(ant.split('\n\n').pop())) blocos[blocos.length - 1] = `${ant}\n\n${p}`;
    // um parágrafo curto que termina com ":" fica junto da lista que vem depois
    else if (ant && ehLista(p) && /:\s*$/.test(ant)) blocos[blocos.length - 1] = `${ant}\n${p}`;
    else blocos.push(p);
  }
  if (blocos.length <= max) return blocos.length ? blocos : [''];
  // Mantém o primeiro e o último; o meio vira um balão só.
  return [blocos[0], blocos.slice(1, -1).join('\n\n'), blocos[blocos.length - 1]].slice(0, max);
}
