# Chia 4S Assist · Ju (4S Consultório)

Plataforma da **Ju**, a assistente virtual com IA do Protocolo 4S Consultório: um chat no estilo de aplicativo de mensagens, com login só pelo e-mail, memória de cada aluna (ficha), check-in semanal, registro de pedidos de reembolso, painel administrativo, webhook de vendas, importação de compradoras por CSV e ferramentas de LGPD.

A arquitetura já está pronta para o futuro **Chat da equipe** (campo `bot`, tabelas e regra de acesso `principal`), mas ele ainda não está ligado.

Para colocar no ar, siga o arquivo `GUIA_DE_PUBLICACAO.md` (na pasta acima desta).

## Como funciona

```
Navegador (public/ju.html)                     Vercel (api/*.js)                    Serviços
  login com o e-mail ────────────────────────► /api/entrar (token assinado, 180 dias)
  chat ── POST /api/chat (token) ────────────► confere acesso, consentimento, limite ─► Supabase (Postgres)
                                               monta prompt + ficha, laço de ferramentas ─► Anthropic (Claude)
  painel (public/admin.html) ── senha ───────► /api/admin/*
  plataforma de vendas ── POST /api/webhook ─► libera ou revoga acesso
```

- As chaves secretas (Anthropic e service role do Supabase) ficam só no servidor. O navegador só conhece a chave pública (anon) do Supabase, usada para o login.
- Todas as tabelas têm RLS ligado e nenhuma política: o navegador não lê o banco. Só as funções da Vercel acessam os dados.
- O prompt da Ju é `prompts/ju.md` (seções 1 a 12 das instruções). A cada mensagem, a API acrescenta um bloco com a data e hora de Brasília, o dia de acesso, os outros produtos da aluna, a ficha guardada e as regras da plataforma (ferramentas, reembolso, transparência). O bloco fixo usa cache de prompt (`cache_control`), o que reduz bastante o custo.
- Ferramentas da Ju: `salvar_ficha` (memória) e `registrar_solicitacao` (acesso e encaminhamentos; a Ju não trata reembolso). No máximo 3 rodadas de ferramentas por mensagem.
- Limite diário: 80 mensagens por aluna (Ju). Acesso à Ju: 90 dias a partir de `upsell1_desde`.

## Estrutura

| Caminho | O que é |
|---|---|
| `public/ju.html`, `public/js/ju.js`, `public/css/ju.css` | Chat da Ju: login, consentimento, bloqueio, conversa, menu ⋮ |
| `public/js/texto.js` | Formatação das mensagens (negrito, listas, escape de HTML) e divisão em balões |
| `public/admin.html`, `public/js/admin.js` | Painel: solicitações, compradoras, importação de CSV |
| `api/chat.js` | Envia mensagem para a Ju |
| `api/history.js`, `api/me.js`, `api/config.js` | Histórico, situação da aluna, configuração pública |
| `api/consent.js`, `api/my-data.js`, `api/delete-my-data.js` | LGPD: consentimento, ver e apagar dados |
| `api/webhook.js` | Webhook de vendas (Cakto, Kiwify, Hotmart e parecidos) |
| `api/admin/*.js` | Painel (senha no cabeçalho `x-admin-password`) |
| `lib/` | Regras de acesso, limite, prompt, ferramentas, laço do modelo, banco (Supabase e memória), leitura de webhooks, CSV |
| `prompts/ju.md` | Prompt de sistema da Ju (seções 1 a 12; a seção 13 fica de fora) |
| `supabase/schema.sql` | Tabelas, RLS e função do limite diário |
| `dev-server.js` | Servidor local (modo de teste ou real) |
| `tests/` | Testes de unidade e de API (`node --test`) |
| `e2e/run.mjs` | Teste ponta a ponta com Playwright e capturas de tela em `e2e/shots/` |

## Rodar no computador

Precisa do Node 20 ou mais novo.

```bash
npm install
npm run dev          # modo de teste: http://localhost:3000/ju
```

No modo de teste (`DEV_FAKE=1`) tudo é simulado: o banco fica na memória, a IA responde com textos prontos e o login é só digitar um dos e-mails de teste. Para testar com a IA de verdade e o resto simulado, rode com `DEV_FAKE=1 DEV_REAL_AI=1 ANTHROPIC_API_KEY=...`.

| Conta de teste | Situação |
|---|---|
| ana@teste.com | Comprou o 4S Consultório (Ju liberada) |
| bia@teste.com | Só o produto principal (Ju bloqueada) |
| carla@teste.com | 4S Consultório vencido (mais de 90 dias) |

Painel: `http://localhost:3000/admin`, senha `admin-teste-123`.

Na IA de teste, mensagens com "reembolso" ou "dinheiro de volta" recebem a resposta de que a Ju não ajuda com isso; "quero falar com uma pessoa" registra um pedido; mensagens com um peso (ex.: "78 kg") salvam a ficha; "churrasco", "esqueci o gel", "check-in zero" e "check-in da semana" têm respostas prontas.

Para usar os serviços reais no computador, copie `.env.example` para `.env.local`, preencha e rode `npm run dev:real`.

## Testes

```bash
npm test             # 32 testes: webhooks, acesso, limite, laço de ferramentas, prompt, LGPD, painel, CSV, formatação
npm run e2e          # Playwright a 390x844: login, consentimento, conversa, pedido no painel, bloqueios, CSV
```

## Variáveis de ambiente

| Nome | Para quê |
|---|---|
| `ANTHROPIC_API_KEY` | Chave da API da Anthropic |
| `MODEL_JU` | Modelo da Ju (padrão `claude-sonnet-5-5`) |
| `MODEL_EQUIPE` | Modelo do futuro chat da equipe (padrão `claude-haiku-5-5`) |
| `SUPABASE_URL` | Endereço do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave secreta do Supabase (só no servidor) |
| `WEBHOOK_SECRET` | Segredo que vai na URL do webhook (`?secret=`) |
| `ADMIN_PASSWORD` | Senha do painel (mínimo 8 caracteres) |
| `APP_URL` | Link da área da aluna (botão voltar) |
| `PRODUTOS_UPSELL1`, `PRODUTOS_PRINCIPAL` | Opcional: trechos do nome ou IDs dos produtos, separados por vírgula (padrão `consultorio` e `chia 4s`) |
| `PRODUTOS_SUSTENTAR`, `PRODUTOS_PELE_FIRME`, `PRODUTOS_COZINHA` | Opcional: idem para os outros produtos que a Ju precisa conhecer |
| `EQUIPE_CHAT_ATIVO` | Deixe vazio enquanto o chat da equipe não existir. Com `1`, a Ju volta a indicar o chat da equipe |

Nunca defina `DEV_FAKE` na Vercel.

## Ligar o Chat da equipe no futuro

1. Escrever `prompts/equipe.md`.
2. Em `lib/config.js`, mudar `BOTS.equipe.enabled` para `true`.
3. Criar a página (pode copiar `ju.html` trocando `BOT` para `equipe` em `ju.js` e a regra de acesso para `principal`).
4. Definir `EQUIPE_CHAT_ATIVO=1` na Vercel.

## Atualizar o prompt da Ju

Edite `prompts/ju.md` (mantendo só as seções 1 a 12) e publique de novo. As regras específicas da plataforma ficam em `lib/prompt.js` (`regrasPlataformaJu`).
