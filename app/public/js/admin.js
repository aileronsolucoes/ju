// Painel: solicitações, compradoras e importação de CSV.
import { escapar } from './texto.js';

const $ = (s) => document.querySelector(s);
let senha = '';
try { senha = sessionStorage.getItem('admin_senha') || ''; } catch { /* ok */ }

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 3000);
}

async function api(path, { method = 'GET', body } = {}) {
  const r = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json', 'x-admin-password': senha },
    body: body ? JSON.stringify(body) : undefined,
  });
  let d = {};
  try { d = await r.json(); } catch { /* ok */ }
  if (!r.ok) {
    const e = new Error(d.mensagem || `Erro ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return d;
}

const dataHora = (s) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const ROT = { reembolso: 'Reembolso', acesso: 'Acesso', outro: 'Outro' };

async function carregarSolicitacoes() {
  const status = $('#filtro-status').value;
  const box = $('#lista-solicitacoes');
  try {
    const { solicitacoes } = await api(`/api/admin/solicitacoes?status=${status}`);
    if (status === 'aberta') $('#cont-abertas').textContent = solicitacoes.length || '';
    if (!solicitacoes.length) {
      box.innerHTML = `<div class="vazio">${status === 'aberta' ? 'Nenhuma solicitação aberta. Tudo em dia.' : 'Nada por aqui.'}</div>`;
      return;
    }
    box.innerHTML = solicitacoes.map((s) => `
      <article class="sol ${s.tipo} ${s.status}">
        <div class="sol-topo">
          <span class="etiqueta">${ROT[s.tipo] || s.tipo}</span>
          <span class="sol-email">${escapar(s.email)}</span>
          <span class="sol-data">${dataHora(s.criado_em)}</span>
        </div>
        ${s.produto ? `<div class="sol-prod">${escapar(s.produto)}</div>` : ''}
        <div class="sol-msg">${escapar(s.mensagem || '')}</div>
        <div class="sol-acoes"><button data-id="${s.id}" data-status="${s.status === 'aberta' ? 'resolvida' : 'aberta'}">${s.status === 'aberta' ? 'Marcar como resolvida' : 'Reabrir'}</button></div>
      </article>`).join('');
  } catch (e) {
    if (e.status === 401) return sair();
    box.innerHTML = `<div class="vazio">${escapar(e.message)}</div>`;
  }
}

$('#lista-solicitacoes').addEventListener('click', async (ev) => {
  const b = ev.target.closest('button[data-id]');
  if (!b) return;
  b.disabled = true;
  try {
    await api('/api/admin/solicitacoes', { method: 'POST', body: { id: b.dataset.id, status: b.dataset.status } });
    toast(b.dataset.status === 'resolvida' ? 'Marcada como resolvida.' : 'Reaberta.');
    await carregarSolicitacoes();
  } catch (e) {
    toast(e.message);
    b.disabled = false;
  }
});

async function carregarCompradoras() {
  const q = $('#busca').value.trim();
  const box = $('#lista-compradoras');
  try {
    const { compradoras } = await api(`/api/admin/compradoras?q=${encodeURIComponent(q)}`);
    if (!compradoras.length) { box.innerHTML = '<div class="vazio">Nenhuma compradora encontrada.</div>'; return; }
    box.innerHTML = compradoras.map((c) => {
      const ju = c.ju?.ok ? `<span class="selo ok">Ju: ${c.ju.dias_restantes} dias</span>`
        : c.upsell1 ? '<span class="selo venc">Ju vencida</span>' : '<span class="selo">Sem Ju</span>';
      return `<div class="comp">
        <div class="comp-info"><div class="comp-nome">${escapar(c.nome || 'Sem nome')}</div><div class="comp-email">${escapar(c.email)}</div></div>
        <div class="selos">${c.principal ? '<span class="selo ok">Chia 4S</span>' : ''}${ju}</div>
      </div>`;
    }).join('');
  } catch (e) {
    if (e.status === 401) return sair();
    box.innerHTML = `<div class="vazio">${escapar(e.message)}</div>`;
  }
}
$('#form-busca').addEventListener('submit', (ev) => { ev.preventDefault(); carregarCompradoras(); });

$('#arquivo').addEventListener('change', async (ev) => {
  const f = ev.target.files[0];
  if (f) $('#csv').value = await f.text();
});
$('#btn-importar').addEventListener('click', async () => {
  const csv = $('#csv').value;
  const out = $('#resultado-import');
  if (!csv.trim()) return toast('Cole o CSV ou escolha um arquivo.');
  try {
    const r = await api('/api/admin/import', { method: 'POST', body: { csv } });
    out.hidden = false;
    out.innerHTML = `<strong>${r.importadas} compradora(s) importada(s).</strong>${r.erros.length ? `<br>Linhas ignoradas:<br>${r.erros.map((e) => `Linha ${e.linha}: ${escapar(e.motivo)}`).join('<br>')}` : ''}`;
  } catch (e) {
    toast(e.message);
  }
});

document.querySelectorAll('.aba').forEach((a) => a.addEventListener('click', () => {
  document.querySelectorAll('.aba').forEach((x) => x.classList.toggle('ativa', x === a));
  document.querySelectorAll('.pagina').forEach((p) => { p.hidden = p.id !== `aba-${a.dataset.aba}`; });
  if (a.dataset.aba === 'compradoras') carregarCompradoras();
  if (a.dataset.aba === 'solicitacoes') carregarSolicitacoes();
}));
$('#filtro-status').addEventListener('change', carregarSolicitacoes);
$('#btn-atualizar').addEventListener('click', carregarSolicitacoes);

async function entrar() {
  try {
    await api('/api/admin/solicitacoes?status=aberta');
    try { sessionStorage.setItem('admin_senha', senha); } catch { /* ok */ }
    $('#login').hidden = true;
    $('#painel').hidden = false;
    $('#btn-sair').hidden = false;
    carregarSolicitacoes();
  } catch (e) {
    const el = $('#erro-login');
    el.textContent = e.message;
    el.hidden = false;
  }
}
function sair() {
  senha = '';
  try { sessionStorage.removeItem('admin_senha'); } catch { /* ok */ }
  $('#login').hidden = false;
  $('#painel').hidden = true;
  $('#btn-sair').hidden = true;
}
$('#btn-sair').addEventListener('click', sair);
$('#form-login').addEventListener('submit', (ev) => {
  ev.preventDefault();
  senha = $('#senha').value;
  entrar();
});
if (senha) entrar();
