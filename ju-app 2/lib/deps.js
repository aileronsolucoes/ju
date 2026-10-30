// Escolhe as implementações reais (Supabase + Anthropic) ou falsas (DEV_FAKE=1).
import { isFake, env } from './config.js';
import { createMemoryDb } from './db-memory.js';
import { createSupabaseDb } from './db-supabase.js';
import { lerToken } from './sessao.js';
import { createAnthropicLlm, createFakeLlm } from './llm.js';

// Compradoras de exemplo do modo de teste
export function seedFake(now = Date.now()) {
  const dias = (n) => new Date(now - n * 86400000).toISOString();
  return {
    compradoras: [
      { email: 'ana@teste.com', nome: 'Ana Souza', principal: true, upsell1: true, upsell1_desde: dias(3), outros_produtos: [] },
      { email: 'bia@teste.com', nome: 'Bia Lima', principal: true, upsell1: false, upsell1_desde: null, outros_produtos: [] },
      { email: 'carla@teste.com', nome: 'Carla Dias', principal: true, upsell1: true, upsell1_desde: dias(95), outros_produtos: [] },
    ],
  };
}

let fakeDeps;
let realDeps;

export function getDeps() {
  if (isFake()) {
    if (!fakeDeps) {
      fakeDeps = {
        fake: true,
        db: createMemoryDb(seedFake()),
        // DEV_REAL_AI=1: banco e login simulados, mas a IA de verdade (precisa de ANTHROPIC_API_KEY)
        llm: env('DEV_REAL_AI') === '1' ? createAnthropicLlm() : createFakeLlm(),
        // Token falso: "fake:<email>" (emitido por /api/dev/verify com o código 123456)
        async emailDoToken(token) {
          if (token && token.startsWith('fake:')) return token.slice(5).toLowerCase();
          return lerToken(token);
        },
      };
    }
    return fakeDeps;
  }
  if (!realDeps) {
    realDeps = { fake: false, db: createSupabaseDb(), llm: createAnthropicLlm(), emailDoToken: async (t) => lerToken(t) };
  }
  return realDeps;
}

// Permite que os testes injetem dependências próprias
export function setDeps(d) {
  fakeDeps = d;
}
