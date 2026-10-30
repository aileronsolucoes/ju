// Ju · 4S Consultório: login, consentimento, bloqueio e chat.
import { renderizar, dividirEmBaloes, escapar } from './texto.js';

const BOT = 'ju';
const $ = (s) => document.querySelector(s);

let cfg = { fake: true, appUrl: '#', consentVersion: '' };
let me = null;
let enviando = false;

// ---------------------------------------------------------------- utilidades
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function mostrarTela(id) {
  document.querySelectorAll('.tela').forEach((t) => { t.hidden = t.id !== id; t.classList.toggle('ativa', t.id === id); });
}

function toast(msg, ms = 3200) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, ms);
}

function mostrarErro(el, msg) {
  el.textContent = msg;
  el.hidden = !msg;
}

function carregarScript(src) {
  return new Promise((ok, falha) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = ok;
    s.onerror = () => falha(new Error('Falha ao carregar ' + src));
    document.head.appendChild(s);
  });
}

// ---------------------------------------------------------------- autenticação
// A aluna entra só com o e-mail da compra; o servidor devolve um token que fica salvo no celular.
const CHAVE_TOKEN = 'ju_token';
const Auth = {
  async iniciar() {},
  async token() {
    try { return localStorage.getItem(CHAVE_TOKEN); } catch { return null; }
  },
  async entrar(email) {
    const r = await fetch('/api/entrar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) });
    let d = {};
    try { d = await r.json(); } catch { /* sem corpo */ }
    if (!r.ok || !d.token) throw new Error(d.mensagem || 'Não consegui entrar agora. Tente de novo.');
    try { localStorage.setItem(CHAVE_TOKEN, d.token); } catch { throw new Error('Ative o armazenamento do navegador para entrar.'); }
  },
  async sair() {
    try { localStorage.removeItem(CHAVE_TOKEN); localStorage.removeItem('ju_fake_token'); } catch { /* ok */ }
  },
};

async function api(path, { method = 'GET', body } = {}) {
  const token = await Auth.token();
  const r = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await r.json(); } catch { /* sem corpo */ }
  if (!r.ok) {
    const e = new Error(data.mensagem || 'Algo deu errado. Tente de novo.');
    e.status = r.status;
    e.data = data;
    throw e;
  }
  return data;
}

// ---------------------------------------------------------------- fluxo principal
async function iniciar() {
  try {
    cfg = await (await fetch('/api/config')).json();
  } catch {
    toast('Sem conexão. Verifique a internet.');
  }
  document.querySelectorAll('.js-area').forEach((a) => { a.href = cfg.appUrl || '#'; });
  try {
    await Auth.iniciar();
  } catch (e) {
    console.error(e);
  }
  await decidirTela();
}

async function decidirTela() {
  const token = await Auth.token();
  if (!token) return irParaLogin();
  try {
    me = await api('/api/me');
  } catch (e) {
    if (e.status === 401) { await Auth.sair(); return irParaLogin(); }
    toast(e.message);
    return irParaLogin();
  }
  if (!me.ju?.ok) return irParaBloqueio(me.ju?.motivo);
  if (!me.consent) return irParaConsent();
  return abrirChat();
}

// ---------------------------------------------------------------- login
function irParaLogin() {
  mostrarErro($('#erro-login'), '');
  mostrarTela('tela-login');
  setTimeout(() => $('#email').focus(), 50);
}

$('#form-email').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const email = $('#email').value.trim().toLowerCase().replace(/\s+/g, '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return mostrarErro($('#erro-login'), 'Digite um e-mail válido.');
  const btn = $('#btn-email');
  btn.classList.add('carregando');
  btn.textContent = 'Entrando...';
  mostrarErro($('#erro-login'), '');
  try {
    await Auth.entrar(email);
    await decidirTela();
  } catch (e) {
    mostrarErro($('#erro-login'), e.message);
  } finally {
    btn.classList.remove('carregando');
    btn.textContent = 'Entrar';
  }
});

// ---------------------------------------------------------------- consentimento
function irParaConsent() {
  $('#aceite').checked = false;
  $('#btn-aceitar').disabled = true;
  mostrarTela('tela-consent');
}
$('#aceite').addEventListener('change', (ev) => { $('#btn-aceitar').disabled = !ev.target.checked; });
$('#btn-aceitar').addEventListener('click', async () => {
  const btn = $('#btn-aceitar');
  btn.classList.add('carregando');
  try {
    await api('/api/consent', { method: 'POST', body: { versao: cfg.consentVersion } });
    me.consent = true;
    await abrirChat();
  } catch (e) {
    mostrarErro($('#erro-consent'), e.message);
  } finally {
    btn.classList.remove('carregando');
  }
});

// ---------------------------------------------------------------- bloqueio
function irParaBloqueio(motivo) {
  const t = $('#bloqueio-texto');
  if (motivo === 'expirado') {
    $('#bloqueio-titulo').textContent = 'Os seus 90 dias com a Ju terminaram';
    t.textContent = 'O acompanhamento da Ju faz parte do 4S Consultório e dura 90 dias a partir da compra. Os seus materiais continuam disponíveis na área da aluna.';
  } else {
    $('#bloqueio-titulo').textContent = 'Este acesso é exclusivo do 4S Consultório';
    t.textContent = 'A Ju acompanha as alunas do Protocolo 4S Consultório. Se você comprou com outro e‑mail, entre com ele. Se acabou de comprar, aguarde alguns minutos e tente de novo.';
  }
  $('#bloqueio-email').textContent = me?.email || '';
  mostrarTela('tela-bloqueio');
}
$('#btn-sair-bloqueio').addEventListener('click', async () => { await Auth.sair(); irParaLogin(); });

// ---------------------------------------------------------------- chat
const lista = () => $('#mensagens');
let ultimo = { lado: null, dia: null };

const TIQUES = '<svg class="tiques" viewBox="0 0 18 11" aria-label="enviada"><path d="M1 5.8l3 3 6-7.3M7.2 8.4l.6.6 6-7.3"/></svg>';
const RELOGIO = '<svg class="relogio" viewBox="0 0 12 12" aria-label="enviando"><circle cx="6" cy="6" r="4.6"/><path d="M6 3.4V6l1.8 1.1"/></svg>';

const hora = (d) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const chaveDia = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
function rotuloDia(d) {
  const hoje = new Date();
  const ontem = new Date(Date.now() - 86400000);
  if (chaveDia(d) === chaveDia(hoje)) return 'Hoje';
  if (chaveDia(d) === chaveDia(ontem)) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', ...(d.getFullYear() !== hoje.getFullYear() ? { year: 'numeric' } : {}) });
}

function rolarFim(suave = true) {
  const c = $('#conversa');
  c.scrollTo({ top: c.scrollHeight, behavior: suave ? 'smooth' : 'auto' });
}

function separadorSeNovoDia(d) {
  const k = chaveDia(d);
  if (ultimo.dia === k) return;
  ultimo.dia = k;
  ultimo.lado = null;
  const el = document.createElement('div');
  el.className = 'data-sep';
  el.innerHTML = `<span>${rotuloDia(d)}</span>`;
  lista().appendChild(el);
}

function adicionarBolha({ lado, texto, data = new Date(), status = 'lido', animar = true }) {
  separadorSeNovoDia(data);
  const nova = ultimo.lado !== lado;
  ultimo.lado = lado;
  const linha = document.createElement('div');
  linha.className = `linha ${lado === 'eu' ? 'eu' : 'ela'}${nova ? ' cauda nova-serie' : ''}${animar ? ' entra' : ''}`;
  const meta = lado === 'eu'
    ? `<span class="meta">${hora(data)} ${status === 'enviando' ? RELOGIO : TIQUES}</span>`
    : `<span class="meta">${hora(data)}</span>`;
  linha.innerHTML = `<div class="bolha${status === 'lido' && lado === 'eu' ? ' lido' : ''}"><div class="txt">${renderizar(texto)}</div>${meta}</div>`;
  // espaço invisível no fim da última linha para a hora caber ao lado do texto
  let alvo = linha.querySelector('.txt').lastElementChild;
  if (alvo && /^(UL|OL)$/.test(alvo.tagName)) alvo = alvo.lastElementChild;
  (alvo || linha.querySelector('.txt')).insertAdjacentHTML('beforeend', '<span class="espaco"></span>');
  lista().appendChild(linha);
  return linha;
}

function marcarEnviada(linha) {
  const m = linha.querySelector('.meta');
  const h = m.textContent.trim();
  m.innerHTML = `${escapar(h)} ${TIQUES}`;
}
function marcarLida(linhas) {
  linhas.forEach((l) => l.querySelector('.bolha').classList.add('lido'));
}

let digitandoEl = null;
function mostrarDigitando(on) {
  const st = $('#status');
  st.textContent = on ? 'digitando...' : 'online';
  st.classList.toggle('digitando', on);
  if (on && !digitandoEl) {
    digitandoEl = document.createElement('div');
    const nova = ultimo.lado !== 'ela';
    digitandoEl.className = `linha ela entra${nova ? ' cauda nova-serie' : ''}`;
    digitandoEl.innerHTML = '<div class="bolha digitando-bolha" aria-label="Ju está digitando"><i></i><i></i><i></i></div>';
    lista().appendChild(digitandoEl);
    rolarFim();
  } else if (!on && digitandoEl) {
    digitandoEl.remove();
    digitandoEl = null;
  }
}

function avisoSistema(msg) {
  const el = document.createElement('div');
  el.className = 'aviso-sistema';
  el.innerHTML = `<span>${escapar(msg)}</span>`;
  lista().appendChild(el);
  ultimo.lado = null;
  rolarFim();
}

async function abrirChat() {
  mostrarTela('tela-chat');
  lista().innerHTML = '';
  ultimo = { lado: null, dia: null };
  let dados;
  try {
    dados = await api(`/api/history?bot=${BOT}`);
  } catch (e) {
    if (e.status === 401) return irParaLogin();
    if (e.data?.erro === 'sem_acesso') return irParaBloqueio(e.data.motivo);
    if (e.data?.erro === 'sem_consentimento') return irParaConsent();
    avisoSistema(e.message);
    return;
  }
  const msgs = dados.mensagens || [];
  const usuarias = [];
  msgs.forEach((m, i) => {
    const data = new Date(m.criado_em);
    if (m.role === 'user') {
      const respondida = msgs.slice(i + 1).some((x) => x.role === 'assistant');
      usuarias.push(adicionarBolha({ lado: 'eu', texto: m.content, data, status: respondida ? 'lido' : 'enviada', animar: false }));
    } else {
      for (const parte of dividirEmBaloes(m.content)) adicionarBolha({ lado: 'ela', texto: parte, data, animar: false });
    }
  });
  $('#chips').hidden = msgs.some((m) => m.role === 'user');
  requestAnimationFrame(() => rolarFim(false));
}

async function enviar(texto, linhaExistente = null) {
  texto = texto.trim();
  if (!texto || enviando) return;
  enviando = true;
  $('#btn-enviar').classList.add('ocupado');
  $('#chips').hidden = true;
  const linha = linhaExistente || adicionarBolha({ lado: 'eu', texto, status: 'enviando' });
  linha.classList.remove('falhou');
  linha.nextElementSibling?.classList.contains('reenviar') && linha.nextElementSibling.remove();
  rolarFim();
  await esperar(250);
  marcarEnviada(linha);
  const t0 = Date.now();
  const timerDigitando = setTimeout(() => mostrarDigitando(true), 600);
  try {
    const { reply } = await api('/api/chat', { method: 'POST', body: { bot: BOT, message: texto } });
    clearTimeout(timerDigitando);
    marcarLida([linha]);
    // garante um "digitando..." visível por um instante, como uma pessoa
    mostrarDigitando(true);
    const minimo = 900 - (Date.now() - t0);
    if (minimo > 0) await esperar(minimo);
    const partes = dividirEmBaloes(reply);
    for (let i = 0; i < partes.length; i++) {
      if (i > 0) {
        mostrarDigitando(true);
        await esperar(Math.min(1600, 500 + partes[i].length * 6));
      }
      mostrarDigitando(false);
      adicionarBolha({ lado: 'ela', texto: partes[i] });
      rolarFim();
    }
  } catch (e) {
    clearTimeout(timerDigitando);
    mostrarDigitando(false);
    if (e.status === 401) { toast('Sua sessão expirou. Entre de novo.'); return irParaLogin(); }
    if (e.data?.erro === 'sem_acesso') return irParaBloqueio(e.data.motivo);
    if (e.data?.erro === 'sem_consentimento') return irParaConsent();
    if (e.status === 429) { linha.remove(); avisoSistema(e.message); return; }
    linha.classList.add('falhou');
    const m = linha.querySelector('.meta');
    m.innerHTML = `${hora(new Date())} <svg class="relogio" viewBox="0 0 12 12" style="stroke:#c0392b"><circle cx="6" cy="6" r="4.6"/><path d="M6 3.5v3M6 8.4v.1"/></svg>`;
    const b = document.createElement('button');
    b.className = 'reenviar';
    b.textContent = 'Não enviada. Toque para tentar de novo.';
    b.onclick = () => { b.remove(); enviar(texto, linha); };
    linha.after(b);
    toast(e.message);
  } finally {
    enviando = false;
    $('#btn-enviar').classList.remove('ocupado');
    $('#status').textContent = 'online';
  }
}

const caixa = $('#msg');
function ajustarAltura() {
  caixa.style.height = 'auto';
  caixa.style.height = `${Math.min(caixa.scrollHeight, 132)}px`;
}
caixa.addEventListener('input', ajustarAltura);
caixa.addEventListener('keydown', (ev) => {
  const celular = matchMedia('(pointer: coarse)').matches;
  if (ev.key === 'Enter' && !ev.shiftKey && !celular) {
    ev.preventDefault();
    $('#form-msg').requestSubmit();
  }
});
$('#form-msg').addEventListener('submit', (ev) => {
  ev.preventDefault();
  if (enviando) return;
  const t = caixa.value;
  if (!t.trim()) { caixa.focus(); return; }
  caixa.value = '';
  ajustarAltura();
  enviar(t);
});
$('#chips').addEventListener('click', (ev) => {
  const c = ev.target.closest('.chip');
  if (c) enviar(c.textContent);
});

// ---------------------------------------------------------------- menu ⋮
const menu = $('#menu');
function fecharMenu() { menu.hidden = true; $('#btn-menu').setAttribute('aria-expanded', 'false'); }
$('#btn-menu').addEventListener('click', (ev) => {
  ev.stopPropagation();
  menu.hidden = !menu.hidden;
  $('#btn-menu').setAttribute('aria-expanded', String(!menu.hidden));
});
document.addEventListener('click', (ev) => { if (!menu.hidden && !menu.contains(ev.target)) fecharMenu(); });
menu.addEventListener('click', () => setTimeout(fecharMenu, 0));

function abrirFolha(titulo, html, acoes = []) {
  $('#folha-titulo').textContent = titulo;
  $('#folha-conteudo').innerHTML = html;
  const box = $('#folha-acoes');
  box.innerHTML = '';
  for (const a of acoes) {
    const b = document.createElement('button');
    b.className = `btn ${a.classe || 'btn-secundario'}`;
    b.textContent = a.texto;
    b.onclick = a.onclick || fecharFolha;
    box.appendChild(b);
  }
  $('#folha-fundo').hidden = false;
}
function fecharFolha() { $('#folha-fundo').hidden = true; }
$('#folha-fundo').addEventListener('click', (ev) => { if (ev.target.id === 'folha-fundo') fecharFolha(); });

const ROTULOS = {
  nome: 'Nome', idade: 'Idade', sexo: 'Sexo', altura_cm: 'Altura (cm)', peso_inicial_kg: 'Peso inicial (kg)',
  peso_atual_kg: 'Peso atual (kg)', medidas_iniciais_cm: 'Medidas iniciais (cm)', medidas_atuais_cm: 'Medidas atuais (cm)',
  linha_dose: 'Linha de dose', dia1: 'Dia 1', semana_atual: 'Semana atual', mapa: 'Horários', perfil_rotina: 'Rotina',
  maior_refeicao: 'Maior refeição', condicoes_saude: 'Condições de saúde', remedios: 'Remédios',
  gravidez_amamentacao: 'Gravidez ou amamentação', historico_transtorno_alimentar: 'Histórico de transtorno alimentar',
  motivo_desistencias: 'O que te fez desistir antes', preferencias_alimentares: 'Preferências alimentares',
  outros_produtos: 'Outros produtos', metas: 'Metas', observacoes: 'Observações', ultimo_checkin: 'Último check-in',
  checkins: 'Check-ins registrados', ajustes: 'Ajustes registrados',
};
function valorLegivel(k, v) {
  if (k === 'checkins' || k === 'ajustes') return `${v.length}`;
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (typeof v === 'number') return v.toLocaleString('pt-BR');
  if (k === 'dia1' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v.split('-').reverse().join('/');
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' ? Object.values(x).join(' ') : x)).join(', ') || 'nenhum';
  if (v && typeof v === 'object') {
    return Object.entries(v).filter(([kk]) => kk !== 'registrado_em')
      .map(([kk, vv]) => `${kk.replace(/_/g, ' ')}: ${typeof vv === 'object' ? JSON.stringify(vv) : vv}`).join(' · ');
  }
  return String(v);
}

$('#m-dados').addEventListener('click', async () => {
  try {
    const d = await api('/api/my-data');
    const entradas = Object.entries(d.ficha || {});
    const linhas = entradas.map(([k, v]) => `<li><span class="k">${escapar(ROTULOS[k] || k.replace(/_/g, ' '))}</span><span class="v">${escapar(valorLegivel(k, v))}</span></li>`).join('');
    const quando = d.consentimento?.aceito_em ? new Date(d.consentimento.aceito_em).toLocaleDateString('pt-BR') : '';
    abrirFolha('Meus dados guardados',
      `${entradas.length ? `<ul class="dados">${linhas}</ul>` : '<p>A sua ficha ainda está vazia. A Ju anota os seus dados quando você faz o check-in zero.</p>'}
       <p class="nota">E-mail: ${escapar(d.email)}<br>Mensagens guardadas: ${d.total_mensagens}${quando ? `<br>Consentimento dado em ${quando}` : ''}</p>`,
      [{ texto: 'Fechar', classe: 'btn-primario' }]);
  } catch (e) {
    toast(e.message);
  }
});

$('#m-apagar').addEventListener('click', () => {
  abrirFolha('Apagar meus dados?',
    '<p>Vamos apagar a sua conversa com a Ju, a sua ficha (peso, medidas, horários e saúde) e o seu consentimento. A Ju vai esquecer tudo e não dá para desfazer.</p><p class="nota">Pedidos de reembolso já registrados e o cadastro da compra são mantidos, porque fazem parte da venda.</p>',
    [
      {
        texto: 'Apagar tudo', classe: 'btn-perigo', onclick: async (ev) => {
          ev.target.classList.add('carregando');
          try {
            await api('/api/delete-my-data', { method: 'POST' });
            fecharFolha();
            toast('Seus dados foram apagados.');
            me.consent = false;
            irParaConsent();
          } catch (e) {
            toast(e.message);
          } finally {
            ev.target.classList.remove('carregando');
          }
        },
      },
      { texto: 'Cancelar' },
    ]);
});

$('#m-sair').addEventListener('click', async () => { await Auth.sair(); irParaLogin(); });

iniciar();
