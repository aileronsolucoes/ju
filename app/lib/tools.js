// Ferramentas que o modelo pode chamar e a execução de cada uma.

const TOOL_SOLICITACAO = {
  name: 'registrar_solicitacao',
  description:
    'Registra um pedido para o responsável pela plataforma tratar: reembolso (garantia), problema de acesso ou outro encaminhamento (sinal de alerta, pedido para falar com uma pessoa, reclamação). Use uma vez por pedido.',
  input_schema: {
    type: 'object',
    properties: {
      tipo: { type: 'string', enum: ['reembolso', 'acesso', 'outro'] },
      produto: { type: 'string', description: 'Produto a que o pedido se refere, ex.: "Protocolo 4S Consultório".' },
      mensagem: { type: 'string', description: 'Resumo curto do pedido, em uma ou duas linhas.' },
    },
    required: ['tipo', 'mensagem'],
  },
};

const TOOL_FICHA = {
  name: 'salvar_ficha',
  description:
    'Guarda ou atualiza a ficha da aluna (memória entre conversas). Envie só os campos novos ou alterados; os demais são mantidos. novo_checkin e novo_ajuste são adicionados ao histórico.',
  input_schema: {
    type: 'object',
    properties: {
      campos: {
        type: 'object',
        description: 'Campos a mesclar na ficha.',
        properties: {
          nome: { type: 'string' },
          idade: { type: 'number' },
          sexo: { type: 'string' },
          altura_cm: { type: 'number' },
          peso_inicial_kg: { type: 'number' },
          peso_atual_kg: { type: 'number' },
          medidas_iniciais_cm: { type: 'object', description: 'cintura, abdomen_baixo, quadril, coxa, braco' },
          medidas_atuais_cm: { type: 'object' },
          linha_dose: { type: 'string', description: 'ex.: "70 a 79,9 kg: 15 g + 350 ml"' },
          dia1: { type: 'string', description: 'Data do dia 1, AAAA-MM-DD' },
          semana_atual: { type: 'number' },
          mapa: { type: 'object', description: 'Horários: acorda, deita, gel, cafe, almoco, jantar, cha etc.' },
          perfil_rotina: { type: 'string' },
          maior_refeicao: { type: 'string' },
          condicoes_saude: { type: 'array', items: { type: 'string' } },
          remedios: { type: 'array', items: { type: 'string' } },
          gravidez_amamentacao: { type: 'boolean' },
          historico_transtorno_alimentar: { type: 'boolean' },
          motivo_desistencias: { type: 'string' },
          preferencias_alimentares: { type: 'string' },
          outros_produtos: { type: 'array', items: { type: 'string' } },
          metas: { type: 'string' },
          observacoes: { type: 'string' },
          novo_checkin: { type: 'object', description: 'Resumo do check-in: data, semana, peso, medidas, fome, intestino, sono, desvios.' },
          novo_ajuste: { type: 'string', description: 'O ajuste principal decidido nesta semana.' },
        },
        additionalProperties: true,
      },
    },
    required: ['campos'],
  },
};

// A Ju não trata reembolso: a ferramenta dela só registra acesso e encaminhamentos.
const TOOL_SOLICITACAO_JU = {
  name: 'registrar_solicitacao',
  description:
    'Registra um caso para o responsável pela plataforma acompanhar: problema de acesso ou encaminhamento (sinal de alerta, suspeita de transtorno alimentar, pedido para falar com uma pessoa, reclamação). Nunca use para reembolso, estorno ou cancelamento. Use uma vez por caso.',
  input_schema: {
    type: 'object',
    properties: {
      tipo: { type: 'string', enum: ['acesso', 'outro'] },
      mensagem: { type: 'string', description: 'Resumo curto do caso, em uma ou duas linhas.' },
    },
    required: ['tipo', 'mensagem'],
  },
};

export function toolsDoBot(bot) {
  if (bot === 'ju') return [TOOL_FICHA, TOOL_SOLICITACAO_JU];
  if (bot === 'equipe') return [TOOL_SOLICITACAO];
  return [];
}

const LIMITE_HIST = 30;

export function mesclarFicha(atual, campos, now = new Date()) {
  const f = { ...(atual || {}) };
  const c = { ...(campos || {}) };
  if (c.novo_checkin && typeof c.novo_checkin === 'object') {
    const ck = { registrado_em: now.toISOString(), ...c.novo_checkin };
    f.checkins = [...(f.checkins || []), ck].slice(-LIMITE_HIST);
    f.ultimo_checkin = ck;
  }
  if (c.novo_ajuste) {
    f.ajustes = [...(f.ajustes || []), { em: now.toISOString(), ajuste: String(c.novo_ajuste) }].slice(-LIMITE_HIST);
  }
  delete c.novo_checkin;
  delete c.novo_ajuste;
  for (const [k, v] of Object.entries(c)) {
    if (v === null || v === undefined) continue;
    if (v && typeof v === 'object' && !Array.isArray(v) && f[k] && typeof f[k] === 'object' && !Array.isArray(f[k])) {
      f[k] = { ...f[k], ...v };
    } else {
      f[k] = v;
    }
  }
  return f;
}

export async function executarFerramenta({ name, input }, { db, email, bot, now = new Date() }) {
  if (name === 'salvar_ficha') {
    const atual = await db.getFicha(email);
    const nova = mesclarFicha(atual, input?.campos || {}, now);
    if (JSON.stringify(nova).length > 50000) return { ok: false, erro: 'ficha muito grande; resuma os campos' };
    await db.saveFicha(email, nova);
    return { ok: true, mensagem: 'Ficha atualizada.' };
  }
  if (name === 'registrar_solicitacao') {
    const validos = bot === 'ju' ? ['acesso', 'outro'] : ['reembolso', 'acesso', 'outro'];
    const tipo = validos.includes(input?.tipo) ? input.tipo : 'outro';
    const produto = input?.produto || (bot === 'ju' ? 'Protocolo 4S Consultório' : 'Protocolo Chia 4S');
    const row = await db.addSolicitacao({ email, tipo, produto, mensagem: String(input?.mensagem || '').slice(0, 2000) });
    return { ok: true, mensagem: `Solicitação registrada (${tipo}).`, protocolo: String(row.id).slice(0, 8) };
  }
  return { ok: false, erro: `ferramenta desconhecida: ${name}` };
}
