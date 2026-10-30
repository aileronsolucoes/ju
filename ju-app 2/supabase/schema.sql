-- Chia 4S Assist: tabelas no Supabase.
-- Cole tudo no Supabase > SQL Editor > New query > Run. Pode rodar de novo sem problema.
-- RLS ligado em todas as tabelas e sem políticas: o navegador (chave anon) não lê nada;
-- só as funções da Vercel, com a service role key, acessam os dados.

create extension if not exists pgcrypto;

create table if not exists public.compradoras (
  email           text primary key check (email = lower(email)),
  nome            text,
  principal       boolean not null default false,       -- Protocolo Chia 4S (chat da equipe, futuro)
  upsell1         boolean not null default false,       -- Protocolo 4S Consultório (Ju)
  upsell1_desde   timestamptz,                          -- início dos 90 dias da Ju
  outros_produtos text[] not null default '{}',         -- sustentar, pele_firme, cozinha_4s
  criado_em       timestamptz not null default now()
);

create table if not exists public.conversas (
  id        uuid primary key default gen_random_uuid(),
  email     text not null,
  bot       text not null check (bot in ('equipe', 'ju')),
  role      text not null check (role in ('user', 'assistant')),
  content   text not null,
  criado_em timestamptz not null default now()
);
create index if not exists conversas_email_bot_idx on public.conversas (email, bot, criado_em desc);

create table if not exists public.fichas (
  email         text primary key,
  dados         jsonb not null default '{}'::jsonb,     -- memória da Ju sobre cada aluna
  atualizado_em timestamptz not null default now()
);

create table if not exists public.solicitacoes (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  tipo         text not null check (tipo in ('reembolso', 'acesso', 'outro')),
  produto      text,
  mensagem     text not null default '',
  status       text not null default 'aberta' check (status in ('aberta', 'resolvida')),
  criado_em    timestamptz not null default now(),
  resolvido_em timestamptz
);
create index if not exists solicitacoes_status_idx on public.solicitacoes (status, criado_em desc);

create table if not exists public.consentimentos (
  id        bigint generated always as identity primary key,
  email     text not null,
  versao    text not null,
  aceito_em timestamptz not null default now()
);
create index if not exists consentimentos_email_idx on public.consentimentos (email, aceito_em desc);

create table if not exists public.uso (
  email     text not null,
  bot       text not null,
  dia       date not null,
  mensagens integer not null default 0,
  primary key (email, bot, dia)
);

alter table public.compradoras    enable row level security;
alter table public.conversas      enable row level security;
alter table public.fichas         enable row level security;
alter table public.solicitacoes   enable row level security;
alter table public.consentimentos enable row level security;
alter table public.uso            enable row level security;

-- Contador atômico do limite diário de mensagens
create or replace function public.incrementar_uso(p_email text, p_bot text, p_dia date)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.uso (email, bot, dia, mensagens)
  values (p_email, p_bot, p_dia, 1)
  on conflict (email, bot, dia) do update set mensagens = public.uso.mensagens + 1
  returning mensagens;
$$;
revoke all on function public.incrementar_uso(text, text, date) from public, anon, authenticated;
grant execute on function public.incrementar_uso(text, text, date) to service_role;

-- OPCIONAL (retenção LGPD): apagar conversas e fichas 180 dias depois do fim do acesso.
-- Rode manualmente de tempos em tempos, ou agende com a extensão pg_cron (Database > Extensions).
-- delete from public.conversas c using public.compradoras p
--   where c.email = p.email and p.upsell1_desde < now() - interval '270 days';
-- delete from public.fichas f using public.compradoras p
--   where f.email = p.email and p.upsell1_desde < now() - interval '270 days';
-- delete from public.uso where dia < current_date - 30;
