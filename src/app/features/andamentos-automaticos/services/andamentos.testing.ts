import { AndamentoApi, AndamentosProcessoApi, PublicacaoApi } from './andamentos.service';

/** Massa dos specs de Andamentos Automáticos — só os campos que importam em cada teste mudam. */

export function andamento(parcial: Partial<AndamentoApi> = {}): AndamentoApi {
  return {
    ordem: 1,
    data_hora: '2026-09-19T14:00:00',
    tipo: 'Movimento',
    codigo: 51,
    nome: 'Conclusão',
    complementos: [],
    fonte: 'DataJud',
    graus: ['G1'],
    orgao_julgador: 'Vara',
    link: null,
    data_disponibilizacao_djen: null,
    chave: 'chave',
    novo: false,
    ...parcial,
  };
}

export function publicacao(parcial: Partial<PublicacaoApi> = {}): PublicacaoApi {
  return {
    ordem: 1,
    id: 1,
    data_disponibilizacao: '2026-09-20',
    data_publicacao: null,
    fonte: 'Comunica/DJEN',
    tribunal: 'TRT16',
    tipo: 'Intimação',
    documento: 'Intimação',
    conteudo_identificado: 'Intimação',
    meio: 'D',
    orgao: 'Vara',
    classe: 'ATOrd',
    destinatarios: [],
    advogados: [],
    cancelada: false,
    motivo_cancelamento: null,
    texto: 'Fica intimado.',
    link: null,
    certidao_url: null,
    numero_comunicacao: 10,
    hash: 'h1',
    chave: 'chave-publicacao',
    novo: false,
    ...parcial,
  };
}

export function painel(parcial: Partial<AndamentosProcessoApi> = {}): AndamentosProcessoApi {
  return {
    processo_id: 1,
    numero_cnj: '0017162-98.2017.5.16.0015',
    status: 'OK',
    consultado_em: '2026-09-26T12:00:00Z',
    tribunais_consultados: ['TRT16', 'TST'],
    tribunais_com_falha: [],
    tribunal: 'TRT16',
    tribunal_nome: 'Tribunal Regional do Trabalho da 16ª Região',
    grau: 'G1',
    classe: 'ATOrd',
    orgao_julgador: 'Vara',
    data_ajuizamento: null,
    sistema: 'PJe',
    formato: 'Eletrônico',
    assuntos: [],
    nivel_sigilo: 0,
    data_ultima_atualizacao: null,
    total_capas: 1,
    total_andamentos: parcial.andamentos?.length ?? 0,
    ultimo_movimento: null,
    capas: [],
    andamentos: [],
    publicacoes: [],
    stf: { status: 'NAO_ENCONTRADO', processos: [] },
    comunica: { status: 'OK', total_publicacoes: parcial.publicacoes?.length ?? 0 },
    ...parcial,
  };
}
