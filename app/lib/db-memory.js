// Banco em memória (modo DEV_FAKE e testes). Mesma interface do db-supabase.js.
import { randomUUID } from 'node:crypto';

export function createMemoryDb(seed = {}) {
  const s = {
    compradoras: new Map(),
    conversas: [],
    fichas: new Map(),
    solicitacoes: [],
    consentimentos: [],
    uso: new Map(),
  };
  for (const c of seed.compradoras || []) s.compradoras.set(c.email, { outros_produtos: [], criado_em: new Date().toISOString(), ...c });

  const clone = (x) => (x == null ? x : structuredClone(x));

  return {
    _state: s,
    async getCompradora(email) {
      return clone(s.compradoras.get(email) || null);
    },
    async upsertCompradora(row) {
      const atual = s.compradoras.get(row.email) || {
        email: row.email, nome: null, principal: false, upsell1: false, upsell1_desde: null,
        outros_produtos: [], criado_em: new Date().toISOString(),
      };
      const novo = { ...atual };
      for (const [k, v] of Object.entries(row)) if (v !== undefined) novo[k] = v;
      s.compradoras.set(row.email, novo);
      return clone(novo);
    },
    async searchCompradoras(q = '', limit = 50) {
      const t = q.toLowerCase();
      return [...s.compradoras.values()]
        .filter((c) => !t || c.email.includes(t) || (c.nome || '').toLowerCase().includes(t))
        .sort((a, b) => (b.criado_em > a.criado_em ? 1 : -1))
        .slice(0, limit)
        .map(clone);
    },
    async listMessages(email, bot, limit = 30) {
      return s.conversas
        .filter((m) => m.email === email && m.bot === bot)
        .slice(-limit)
        .map(clone);
    },
    async addMessages(rows) {
      let t = Date.now();
      for (const r of rows) {
        // garante ordem estável quando duas mensagens são salvas no mesmo milissegundo
        const criado_em = r.criado_em || new Date(t++).toISOString();
        s.conversas.push({ id: randomUUID(), ...r, criado_em });
      }
    },
    async getFicha(email) {
      return clone(s.fichas.get(email)?.dados || null);
    },
    async saveFicha(email, dados) {
      s.fichas.set(email, { email, dados: clone(dados), atualizado_em: new Date().toISOString() });
    },
    async addSolicitacao({ email, tipo, produto, mensagem }) {
      const row = { id: randomUUID(), email, tipo, produto: produto || null, mensagem: mensagem || '', status: 'aberta', criado_em: new Date().toISOString(), resolvido_em: null };
      s.solicitacoes.push(row);
      return clone(row);
    },
    async listSolicitacoes({ status } = {}) {
      return s.solicitacoes
        .filter((r) => !status || r.status === status)
        .sort((a, b) => (b.criado_em > a.criado_em ? 1 : -1))
        .map(clone);
    },
    async resolverSolicitacao(id, status = 'resolvida') {
      const r = s.solicitacoes.find((x) => x.id === id);
      if (!r) return null;
      r.status = status;
      r.resolvido_em = status === 'resolvida' ? new Date().toISOString() : null;
      return clone(r);
    },
    async getConsent(email) {
      const rows = s.consentimentos.filter((c) => c.email === email);
      return clone(rows[rows.length - 1] || null);
    },
    async addConsent(email, versao) {
      s.consentimentos.push({ email, versao, aceito_em: new Date().toISOString() });
    },
    async incrementUso(email, bot, dia) {
      const k = `${email}|${bot}|${dia}`;
      const n = (s.uso.get(k) || 0) + 1;
      s.uso.set(k, n);
      return n;
    },
    async deleteUserData(email) {
      const antes = s.conversas.length;
      s.conversas = s.conversas.filter((m) => m.email !== email);
      const fichas = s.fichas.delete(email) ? 1 : 0;
      const c0 = s.consentimentos.length;
      s.consentimentos = s.consentimentos.filter((c) => c.email !== email);
      return { conversas: antes - s.conversas.length, fichas, consentimentos: c0 - s.consentimentos.length };
    },
  };
}
