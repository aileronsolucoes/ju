// Banco real: Supabase (Postgres) acessado só pelo servidor com a service role key.
import { createClient } from '@supabase/supabase-js';
import { env } from './config.js';

let client;
export function supabaseAdmin() {
  if (!client) {
    const url = env('SUPABASE_URL');
    const key = env('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) throw new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configuradas');
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

function ok({ data, error }) {
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}

export function createSupabaseDb() {
  const sb = () => supabaseAdmin();
  return {
    async getCompradora(email) {
      return ok(await sb().from('compradoras').select('*').eq('email', email).maybeSingle());
    },
    async upsertCompradora(row) {
      const clean = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
      return ok(await sb().from('compradoras').upsert(clean, { onConflict: 'email' }).select().single());
    },
    async searchCompradoras(q = '', limit = 50) {
      let query = sb().from('compradoras').select('*').order('criado_em', { ascending: false }).limit(limit);
      const t = q.replace(/[%,()]/g, '').trim();
      if (t) query = query.or(`email.ilike.%${t}%,nome.ilike.%${t}%`);
      return ok(await query);
    },
    async listMessages(email, bot, limit = 30) {
      const rows = ok(
        await sb().from('conversas').select('role,content,criado_em')
          .eq('email', email).eq('bot', bot)
          .order('criado_em', { ascending: false }).limit(limit),
      );
      return rows.reverse();
    },
    async addMessages(rows) {
      // Horários explícitos e crescentes para manter a ordem (pergunta antes da resposta).
      let t = Date.now();
      const withTs = rows.map((r) => ({ ...r, criado_em: r.criado_em || new Date(t++).toISOString() }));
      ok(await sb().from('conversas').insert(withTs));
    },
    async getFicha(email) {
      const r = ok(await sb().from('fichas').select('dados').eq('email', email).maybeSingle());
      return r ? r.dados : null;
    },
    async saveFicha(email, dados) {
      ok(await sb().from('fichas').upsert({ email, dados, atualizado_em: new Date().toISOString() }, { onConflict: 'email' }));
    },
    async addSolicitacao({ email, tipo, produto, mensagem }) {
      return ok(await sb().from('solicitacoes').insert({ email, tipo, produto: produto || null, mensagem: mensagem || '' }).select().single());
    },
    async listSolicitacoes({ status } = {}) {
      let q = sb().from('solicitacoes').select('*').order('criado_em', { ascending: false }).limit(500);
      if (status) q = q.eq('status', status);
      return ok(await q);
    },
    async resolverSolicitacao(id, status = 'resolvida') {
      return ok(
        await sb().from('solicitacoes')
          .update({ status, resolvido_em: status === 'resolvida' ? new Date().toISOString() : null })
          .eq('id', id).select().maybeSingle(),
      );
    },
    async getConsent(email) {
      return ok(
        await sb().from('consentimentos').select('versao,aceito_em').eq('email', email)
          .order('aceito_em', { ascending: false }).limit(1).maybeSingle(),
      );
    },
    async addConsent(email, versao) {
      ok(await sb().from('consentimentos').insert({ email, versao }));
    },
    async incrementUso(email, bot, dia) {
      return ok(await sb().rpc('incrementar_uso', { p_email: email, p_bot: bot, p_dia: dia }));
    },
    async deleteUserData(email) {
      const del = async (t) => {
        const { count, error } = await sb().from(t).delete({ count: 'exact' }).eq('email', email);
        if (error) throw new Error(`Supabase: ${error.message}`);
        return count || 0;
      };
      return { conversas: await del('conversas'), fichas: await del('fichas'), consentimentos: await del('consentimentos') };
    },
  };
}

// Valida o token de login (Supabase Auth) e devolve o e-mail.
export async function emailDoToken(token) {
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data?.user?.email) return null;
  return data.user.email.toLowerCase();
}
