// Chamada ao modelo (Anthropic Messages API) e um modelo falso para desenvolvimento/testes.
import { env } from './config.js';

const API_URL = 'https://api.anthropic.com/v1/messages';

export function createAnthropicLlm({ fetchImpl = globalThis.fetch } = {}) {
  return {
    async create(body) {
      const key = env('ANTHROPIC_API_KEY');
      if (!key) throw new Error('ANTHROPIC_API_KEY não configurada');
      let lastErr;
      for (let tentativa = 0; tentativa < 2; tentativa++) {
        const r = await fetchImpl(API_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(body),
        });
        if (r.ok) return r.json();
        const txt = await r.text().catch(() => '');
        lastErr = new Error(`Anthropic ${r.status}: ${txt.slice(0, 300)}`);
        lastErr.status = r.status;
        // Tenta de novo uma vez em sobrecarga / limite / erro do servidor
        if (![429, 500, 502, 503, 504, 529].includes(r.status)) break;
        await new Promise((res) => setTimeout(res, 1500));
      }
      throw lastErr;
    },
  };
}

// ---------------------------------------------------------------------------
// Modelo falso (DEV_FAKE=1): respostas prontas que também passam pelo caminho das ferramentas.
// ---------------------------------------------------------------------------
const textoDe = (content) =>
  typeof content === 'string' ? content : (content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');

let seq = 0;
const toolUse = (name, input) => ({
  id: `msg_fake_${++seq}`,
  type: 'message',
  role: 'assistant',
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', id: `toolu_fake_${seq}`, name, input }],
  usage: { input_tokens: 0, output_tokens: 0 },
});
const texto = (t) => ({
  id: `msg_fake_${++seq}`,
  type: 'message',
  role: 'assistant',
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: t }],
  usage: { input_tokens: 0, output_tokens: 0 },
});

export function fakeResposta(body) {
  const msgs = body.messages || [];
  const last = msgs[msgs.length - 1];
  const temFerramentas = Array.isArray(body.tools) && body.tools.length && body.tool_choice?.type !== 'none';

  // Depois de executar uma ferramenta: confirma.
  if (last && Array.isArray(last.content) && last.content.some((b) => b.type === 'tool_result')) {
    const anterior = msgs[msgs.length - 2];
    const nome = (anterior?.content || []).find((b) => b.type === 'tool_use')?.name;
    if (nome === 'registrar_solicitacao') {
      return texto('Pronto, registrei o seu pedido. O retorno chega pelo e-mail da compra.');
    }
    if (nome === 'salvar_ficha') {
      return texto(
        'Anotei tudo na sua ficha. Com **78,4 kg**, a sua linha é a de 70 a 79,9 kg.\n\n' +
          '1. **Dose:** dias 1 a 3, meia dose: 7,5 g (¾ de col. sopa) + 200 ml. Do dia 4 em diante, 15 g (1 ½ col. sopa) + 350 ml.\n' +
          '2. **Horários:** acordando às 6:30, água 6:35, gel 6:40, luz natural 6:45, café da manhã 7:10.\n' +
          '3. **Água:** 2,5 L por dia, a maior parte até as 19:00.\n\n' +
          'Na segunda-feira, me mande o peso em jejum e as 5 medidas. Estou aqui.',
      );
    }
    return texto('Feito.');
  }

  const t = textoDe(last?.content).toLowerCase();
  if (/reembols|reenbols|devolu|estorn|dinheiro de volta|cancelar/.test(t)) {
    return texto('Com isso eu não consigo te ajudar por aqui. O pedido é feito respondendo o e-mail que você recebeu quando comprou.\n\nAqui eu cuido do seu protocolo. Quer seguir com ele?');
  }
  if (temFerramentas && /falar com (uma )?pessoa|atendente|humano/.test(t)) {
    return toolUse('registrar_solicitacao', { tipo: 'outro', mensagem: textoDe(last.content).slice(0, 500) });
  }
  const peso = t.match(/(\d{2,3}(?:[.,]\d)?)\s*kg/);
  if (temFerramentas && peso) {
    return toolUse('salvar_ficha', { campos: { peso_inicial_kg: Number(peso[1].replace(',', '.')), ultimo_checkin: { tipo: 'zero' } } });
  }
  if (/check-in zero/.test(t)) {
    return texto(
      'Bora começar! Vou te perguntar uma coisa de cada vez, pode responder do seu jeito.\n\nPrimeiro: qual é o seu nome e quantos anos você tem?',
    );
  }
  if (/check-in da semana/.test(t)) {
    return texto(
      'Bora! Me conte, do jeito que for mais fácil:\n\n- Peso em jejum de hoje\n- As 5 medidas\n- Quantos dias de gel (de 7)\n- Fome, intestino e sono da semana\n- Algum desvio\n\nSe faltar alguma coisa, eu trabalho com o que você mandar.',
    );
  }
  if (/churrasco/.test(t)) {
    return texto(
      'Churrasco combina com o protocolo, dá para ir tranquila.\n\n' +
        '1. Gel normal de manhã e café com proteína\n2. No churrasco: 2 mãos de salada primeiro, depois 1 a 2 palmas de carne magra, frango ou linguiça de frango\n' +
        '3. Carboidrato: 1 punho (mandioca cozida ou arroz), sem pão de alho\n4. Bebida: água com gás e limão, nada de álcool\n\n' +
        'Se sair do plano, no domingo é só seguir de onde parou, sem compensar com jejum.',
    );
  }
  if (/esqueci/.test(t) && /gel/.test(t)) {
    return texto(
      'Acontece! Prepare agora com água em temperatura ambiente ou morna, mexa bem e espere **no mínimo 25 a 30 minutos**, mexendo a cada 10.\n\nNunca tome a chia seca ou recém-misturada. Se não der tempo hoje, pule a dose e amanhã segue normal.',
    );
  }
  if (/(você é|voce e|humana|pessoa|juliana|robô|robo)/.test(t)) {
    return texto('Eu sou a Ju, a assistente virtual com IA que a Juliana treinou com a experiência do consultório dela. Não sou médica nem nutricionista.\n\nEu acompanho os seus números toda semana e te devolvo o plano ajustado.');
  }
  return texto(
    'Entendi! Para eu te ajudar direitinho, me conte em que dia do protocolo você está e o que aconteceu.\n\nSe for o seu primeiro contato, toque em "Fazer meu check-in zero".',
  );
}

export function createFakeLlm({ delayMs = Number(env('FAKE_DELAY_MS', '1200')) } = {}) {
  return {
    calls: [],
    async create(body) {
      this.calls.push(body);
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      return fakeResposta(body);
    },
  };
}
