// Leitura tolerante de webhooks de plataformas de venda (Cakto, Kiwify, Hotmart e formatos parecidos).
import { env } from './config.js';

export const normalizar = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const isEmail = (s) => typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

// Procura o primeiro valor em vários caminhos possíveis ("a.b.c").
function pick(obj, paths) {
  for (const p of paths) {
    let cur = obj;
    for (const k of p.split('.')) {
      if (cur == null) break;
      cur = cur[k];
    }
    if (cur !== undefined && cur !== null && cur !== '') return cur;
  }
  return undefined;
}

// Último recurso: varre o JSON atrás do primeiro campo que pareça e-mail.
function acharEmail(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 6) return undefined;
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && /mail/i.test(k) && isEmail(v)) return v;
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') {
      const r = acharEmail(v, depth + 1);
      if (r) return r;
    }
  }
  return undefined;
}

const EMAIL_PATHS = [
  'data.customer.email', 'data.buyer.email', 'Customer.email', 'customer.email', 'buyer.email',
  'data.client.email', 'client.email', 'data.email', 'email', 'cliente.email', 'comprador.email',
];
const NOME_PATHS = [
  'data.customer.name', 'data.buyer.name', 'Customer.full_name', 'Customer.first_name', 'customer.name',
  'customer.full_name', 'buyer.name', 'data.client.name', 'client.name', 'data.name', 'name', 'nome',
  'cliente.nome', 'comprador.nome',
];
const PROD_ID_PATHS = [
  'data.product.id', 'data.product.ucode', 'data.offer.id', 'Product.product_id', 'product.id', 'product_id',
  'data.product_id', 'produto.id', 'offer.id',
];
const PROD_NOME_PATHS = [
  'data.product.name', 'Product.product_name', 'product.name', 'product_name', 'data.product_name',
  'data.offer.name', 'produto.nome', 'offer.name', 'data.offer_name',
];
const EVENTO_PATHS = [
  'event', 'webhook_event_type', 'data.status', 'order_status', 'data.purchase.status', 'status', 'type', 'evento',
];
const DATA_PATHS = [
  'data.paidAt', 'data.purchase.approved_date', 'data.purchase.order_date', 'approved_date', 'created_at',
  'data.createdAt', 'creation_date',
];

// Classifica o evento em aprovado | revogado | ignorado.
export function classificarEvento(...valores) {
  const t = valores.filter(Boolean).map(normalizar).join(' ');
  if (!t) return 'desconhecido';
  if (/(refund|reembols|estorn|chargeback|chargedback|contest|dispute)/.test(t)) return 'revogado';
  if (/(approved|aprovad|paid|pago|complete|completed|concluid|order_approved|purchase_approved|authorized)/.test(t)) {
    return 'aprovado';
  }
  // pix gerado, boleto, carrinho abandonado, recusado, cancelado antes do pagamento etc.
  return 'ignorado';
}

function listaEnv(nome, padrao) {
  return env(nome, padrao).split(',').map(normalizar).filter(Boolean);
}

// Mapa produto -> acesso. Configurável por variável de ambiente (nomes ou IDs separados por vírgula).
export function classificarProduto(produtoId, produtoNome) {
  const id = normalizar(produtoId);
  const nome = normalizar(produtoNome);
  const casa = (lista) => lista.some((t) => (id && id === t) || (nome && nome.includes(t)));
  // Ordem importa: o nome do upsell também pode conter "4s".
  if (casa(listaEnv('PRODUTOS_UPSELL1', 'consultorio'))) return 'upsell1';
  if (casa(listaEnv('PRODUTOS_SUSTENTAR', 'sustentar'))) return 'sustentar';
  if (casa(listaEnv('PRODUTOS_PELE_FIRME', 'pele firme'))) return 'pele_firme';
  if (casa(listaEnv('PRODUTOS_COZINHA', 'cozinha 4s'))) return 'cozinha_4s';
  if (casa(listaEnv('PRODUTOS_PRINCIPAL', 'chia 4s'))) return 'principal';
  return null;
}

export function detectarPlataforma(body, headers = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  if (h['x-hotmart-hottok'] || body?.hottok || (body?.data?.buyer && body?.event)) return 'hotmart';
  if (body?.webhook_event_type || body?.Customer || body?.order_status) return 'kiwify';
  if (body?.data?.customer && body?.event) return 'cakto';
  return 'generica';
}

/**
 * @returns {{plataforma, email, nome, produtoId, produtoNome, acesso, evento, dataCompra}}
 */
export function lerWebhook(body, headers = {}) {
  let b = body;
  if (typeof b === 'string') {
    try { b = JSON.parse(b); } catch { b = Object.fromEntries(new URLSearchParams(b)); }
  }
  b = b || {};
  // Cakto (webhook V2) manda "data" como lista: usa o primeiro pedido.
  if (Array.isArray(b.data) && b.data.length) b = { ...b, data: b.data[0] };
  const plataforma = detectarPlataforma(b, headers);
  let email = pick(b, EMAIL_PATHS);
  if (!isEmail(email)) email = acharEmail(b);
  const nomeRaw = pick(b, NOME_PATHS);
  const produtoId = pick(b, PROD_ID_PATHS);
  const produtoNome = pick(b, PROD_NOME_PATHS);
  const eventoBruto = pick(b, EVENTO_PATHS);
  // Na Kiwify o status do pedido é mais confiável que o tipo do evento.
  const evento = classificarEvento(b.order_status, eventoBruto, b.data?.purchase?.status, b.data?.status);
  const dataBruta = pick(b, DATA_PATHS);
  let dataCompra = null;
  if (typeof dataBruta === 'number' || /^\d{10,13}$/.test(String(dataBruta ?? ''))) {
    const n = Number(dataBruta);
    dataCompra = new Date(n < 1e12 ? n * 1000 : n).toISOString(); // Hotmart manda milissegundos
  } else if (dataBruta && !Number.isNaN(Date.parse(dataBruta))) {
    dataCompra = new Date(dataBruta).toISOString();
  }
  // Data no futuro ou absurda: usa agora
  if (dataCompra && (Date.parse(dataCompra) > Date.now() + 86400000 || Date.parse(dataCompra) < Date.parse('2020-01-01'))) dataCompra = null;
  return {
    plataforma,
    email: isEmail(email) ? email.trim().toLowerCase() : null,
    nome: typeof nomeRaw === 'string' ? nomeRaw.trim().slice(0, 120) : null,
    produtoId: produtoId != null ? String(produtoId) : null,
    produtoNome: produtoNome != null ? String(produtoNome) : null,
    acesso: classificarProduto(produtoId, produtoNome),
    evento,
    eventoBruto: eventoBruto != null ? String(eventoBruto) : null,
    dataCompra,
  };
}

// Extrai um possível segredo enviado no corpo/cabeçalho pela plataforma.
export function segredoRecebido(req, body) {
  const h = Object.fromEntries(Object.entries(req.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
  return [
    req.query?.secret,
    h['x-webhook-secret'],
    h['x-hotmart-hottok'],
    typeof body === 'object' && body ? body.secret : undefined,
    typeof body === 'object' && body ? body.hottok : undefined,
    typeof body === 'object' && body ? body.token : undefined,
  ].filter((v) => typeof v === 'string' && v);
}
