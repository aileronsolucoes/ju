// Configuração central. Tudo vem de variáveis de ambiente (Vercel > Settings > Environment Variables).

export function env(name, fallback = '') {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

export const isFake = () => env('DEV_FAKE') === '1';

export const CONSENT_VERSION = 'v1-2026-10';
export const JU_DIAS_ACESSO = 90;

// Limites diários de mensagens por aluna (anti-abuso e controle de custo)
export const LIMITES_DIARIOS = { equipe: 60, ju: 80 };

// Assistentes da plataforma. "equipe" fica pronto na arquitetura, mas ainda não está ligado.
export const BOTS = {
  ju: {
    enabled: true,
    model: () => env('MODEL_JU', 'claude-sonnet-5-5'),
    // inclui o raciocínio interno do modelo (que conta como saída); a resposta em si é curta
    maxTokens: 8000,
    historico: 30,
    produto: 'Protocolo 4S Consultório',
  },
  equipe: {
    enabled: false,
    model: () => env('MODEL_EQUIPE', 'claude-haiku-5-5'),
    maxTokens: 4000,
    historico: 30,
    produto: 'Protocolo Chia 4S',
  },
};

export const MAX_TOOL_ROUNDS = 3;
export const MAX_MSG_CHARS = 4000;
