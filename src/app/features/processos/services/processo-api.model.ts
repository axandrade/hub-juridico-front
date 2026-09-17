/**
 * Formas de resposta de `/api/v1/processos` (Spring). JSON snake_case (ver `JacksonConfig`),
 * mesmo padrão de `advogado-api.model.ts` — sem model camelCase à parte.
 */

export type TipoProcesso = 'JUDICIAL' | 'ADMINISTRATIVO' | 'ARBITRAL';

export const TIPO_PROCESSO_LABEL: Record<TipoProcesso, string> = {
  JUDICIAL: 'Judicial',
  ADMINISTRATIVO: 'Administrativo',
  ARBITRAL: 'Arbitral',
};

/** Um cliente secundário: `Pessoa` vinculada + posição processual dela. */
export interface ClienteSecundarioApi {
  pessoa_id: number;
  posicao: string | null;
}

/** Uma parte contrária secundária (texto livre). `documento` é CPF ou CNPJ, só dígitos. */
export interface ParteContrariaApi {
  nome: string;
  posicao: string | null;
  documento: string | null;
}

/**
 * Um advogado "outro envolvido" (aba "Outros envolvidos", seção "Advogados") — tudo texto livre,
 * sem vínculo com o cadastro de advogados. `uf` é a sigla (2 letras).
 */
export interface OutroEnvolvidoAdvogadoApi {
  advogado: string;
  posicao: string | null;
  oab: string | null;
  uf: string | null;
}

/**
 * Um magistrado "outro envolvido" (aba "Outros envolvidos", seção "Magistrados") — resposta.
 * `magistrado` e `data` (ISO `yyyy-MM-dd`) são obrigatórios; `resultado` é o texto do catálogo
 * `ResultadoDecisao`; `orgao` já vem resolvido (id + "TRIBUNAL - descrição"), `null` = sem órgão.
 */
export interface OutroEnvolvidoMagistradoApi {
  magistrado: MagistradoAtualApi | null;
  resultado: string | null;
  orgao: OrgaoProcessanteApi | null;
  data: string;
}

/** Item do catálogo `magistrados` já resolvido (id + nome) — devolvido dentro da ficha do processo. */
export interface MagistradoAtualApi {
  id: number;
  nome: string;
}

/** Corpo de um magistrado no `PUT`/`POST` — `magistrado_id`/`orgao_id` são chave estrangeira. */
export interface OutroEnvolvidoMagistradoWriteApi {
  magistrado_id: number;
  resultado: string | null;
  orgao_id: number | null;
  data: string;
}

/**
 * Uma testemunha "outra envolvida" (aba "Outros envolvidos", seção "Testemunhas"). `testemunha` e
 * `parte_interessada` são obrigatórios (`parte_interessada` é o texto do catálogo
 * `ParteInteressada`); `cpf` é opcional, só dígitos (sem CNPJ — testemunha é sempre pessoa física).
 */
export interface OutroEnvolvidoTestemunhaApi {
  testemunha: string;
  cpf: string | null;
  parte_interessada: string;
}

/**
 * Um perito "outro envolvido" (aba "Outros envolvidos", seção "Perito Judicial") — resposta.
 * `perito` já vem resolvido (id + nome + cpf, catálogo `peritos`); `resultado` é o texto do
 * catálogo `ResultadoDecisao`.
 */
export interface OutroEnvolvidoPeritoApi {
  perito: PeritoAtualApi | null;
  resultado: string | null;
}

/** Item do catálogo `peritos` já resolvido (id + nome + cpf) — devolvido dentro da ficha do processo. */
export interface PeritoAtualApi {
  id: number;
  nome: string;
  cpf: string | null;
}

/** Corpo de um perito no `PUT`/`POST` — `perito_id` é chave estrangeira. */
export interface OutroEnvolvidoPeritoWriteApi {
  perito_id: number;
  resultado: string | null;
}

/**
 * Um assistente técnico "outro envolvido" (aba "Outros envolvidos", seção "Assistente Técnico").
 * `assistente_tecnico` e `parte_interessada` são obrigatórios (`parte_interessada` é o texto do
 * catálogo `ParteInteressada`, mesmo de "Testemunhas"); `cpf` é opcional, só dígitos (sem CNPJ —
 * assistente técnico é sempre pessoa física).
 */
export interface OutroEnvolvidoAssistenteTecnicoApi {
  assistente_tecnico: string;
  cpf: string | null;
  parte_interessada: string;
}

/**
 * Um cenário de risco da aba "Objeto" (provável / possível / remoto). `valor`/`percentual` são
 * número (BRL / %) ou `null` (cenário não informado); `percentual` é snapshot de
 * `valor / valor_pedido * 100`. `provisionar` = se o escritório provisiona esse cenário.
 */
export interface CenarioRiscoApi {
  valor: number | null;
  percentual: number | null;
  provisionar: boolean;
}

/**
 * Uma entrada do histórico de "Observações gerais" — arquivada automaticamente pelo backend
 * quando o texto muda num `PUT`. `autor_id` pode ser `null` (importação). Só leitura.
 */
export interface ObservacaoProcessoApi {
  data: string;
  autor_id: number | null;
  autor_nome: string | null;
  texto: string;
}

/**
 * Um item de "Órgãos processantes" (`ProcessoResponse.orgaosProcessantes`) — mesma forma de
 * `OrgaoJulgador` do catálogo (`nome` pronto como "TRIBUNAL - descrição"), devolvido dentro da
 * ficha do processo pra não precisar de uma segunda chamada.
 */
export interface OrgaoProcessanteApi {
  id: number;
  nome: string;
  tribunal_id: number;
}

/**
 * Tribunal "atual" do processo (`ProcessoResponse.tribunalAtual`) — independente do órgão: pode
 * vir preenchido mesmo sem nenhum órgão específico escolhido ainda (tribunal novo, sem órgão
 * cadastrado no catálogo). Mesma forma do catálogo `Tribunal` (`/domain/tribunal`).
 */
export interface TribunalAtualApi {
  id: number;
  nome: string;
}

/**
 * Uma entrada do histórico de tribunais responsáveis pelo processo — registrada automaticamente
 * quando um órgão novo entra em "Órgãos processantes". Nomes resolvidos ao vivo (podem ser `null`
 * se o tribunal/órgão foi excluído do catálogo depois). Só leitura.
 */
export interface ProcessoTribunalHistoricoApi {
  data: string;
  tribunal_nome: string | null;
  orgao_nome: string | null;
}

/** `ProcessoResumoResponse` — uma linha da listagem (só escalares, sem as coleções). */
export interface ProcessoResumoApi {
  id: number;
  favorito: boolean;
  tipo: TipoProcesso;
  numero_cnj: string | null;
  status: string | null;
  status_id: number | null;
  pasta: string | null;
  cliente_principal_id: number | null;
  advogado_responsavel_id: number | null;
  natureza: string | null;
  natureza_id: number | null;
  fase: string | null;
  fase_id: number | null;
  uf: string | null;
  cidade: string | null;
  cidade_id: number | null;
  data_distribuicao: string | null;
  observacoes_gerais: string | null;
  destacar_observacao: boolean;
  ativo: boolean;
  atualizado_em: string | null;
}

/** `ProcessoResponse` — completo (aba "Informações básicas" + coleções + auditoria). */
export interface ProcessoApi {
  id: number;
  favorito: boolean;
  tipo: TipoProcesso;
  numero_cnj: string | null;
  status: string | null;
  status_id: number | null;
  pasta: string | null;

  cliente_principal_id: number | null;
  cliente_principal_posicao: string | null;
  cliente_principal_posicao_id: number | null;

  contrario_principal_nome: string | null;
  contrario_principal_posicao: string | null;
  contrario_principal_posicao_id: number | null;
  contrario_principal_documento: string | null;

  advogado_responsavel_id: number | null;
  data_distribuicao: string | null;
  acao: string | null;
  acao_id: number | null;
  natureza: string | null;
  natureza_id: number | null;
  procedimento: string | null;
  procedimento_id: number | null;
  fase: string | null;
  fase_id: number | null;
  uf: string | null;
  cidade: string | null;
  cidade_id: number | null;
  observacoes_gerais: string | null;
  destacar_observacao: boolean;

  objeto_principal: string | null;
  observacoes_objeto: string | null;
  valor_pedido: number | null;
  valor_deferido: number | null;
  cenario_provavel: CenarioRiscoApi;
  cenario_possivel: CenarioRiscoApi;
  cenario_remoto: CenarioRiscoApi;
  objetos_secundarios: string[];

  clientes_secundarios: ClienteSecundarioApi[];
  partes_contrarias: ParteContrariaApi[];
  outros_envolvidos_advogados: OutroEnvolvidoAdvogadoApi[];
  outros_envolvidos_magistrados: OutroEnvolvidoMagistradoApi[];
  outros_envolvidos_testemunhas: OutroEnvolvidoTestemunhaApi[];
  outros_envolvidos_peritos: OutroEnvolvidoPeritoApi[];
  outros_envolvidos_assistentes_tecnicos: OutroEnvolvidoAssistenteTecnicoApi[];
  /** Tribunal atual — `null` só se nunca houve tribunal nenhum (nem no histórico). */
  tribunal_atual: TribunalAtualApi | null;
  /** Órgão processante atual — `null` se ainda não definido (pode ter só o tribunal). Trocar arquiva o anterior no histórico. */
  orgao_processante: OrgaoProcessanteApi | null;
  escritorios_anteriores: string[];
  tags: string[];
  observacoes_previas: ObservacaoProcessoApi[];
  tribunais_historico: ProcessoTribunalHistoricoApi[];

  ativo: boolean;
  atualizado_em: string | null;
}

/** Corpo do `POST` / `PUT` de processo (`ProcessoRequest` no backend) — snake_case. */
export interface ProcessoWriteApi {
  tipo: TipoProcesso;
  numero_cnj: string | null;
  status_id: number | null;

  cliente_principal_id: number | null;
  cliente_principal_posicao_id: number | null;

  contrario_principal_nome: string | null;
  contrario_principal_posicao_id: number | null;
  contrario_principal_documento: string | null;

  advogado_responsavel_id: number | null;
  data_distribuicao: string | null;
  acao_id: number | null;
  natureza_id: number | null;
  procedimento_id: number | null;
  fase_id: number | null;
  uf: string | null;
  cidade_id: number | null;
  observacoes_gerais: string | null;
  destacar_observacao: boolean;

  objeto_principal: string | null;
  observacoes_objeto: string | null;
  valor_pedido: number | null;
  valor_deferido: number | null;
  cenario_provavel: CenarioRiscoApi;
  cenario_possivel: CenarioRiscoApi;
  cenario_remoto: CenarioRiscoApi;
  objetos_secundarios: string[];

  clientes_secundarios: ClienteSecundarioApi[];
  partes_contrarias: ParteContrariaApi[];
  outros_envolvidos_advogados: OutroEnvolvidoAdvogadoApi[];
  outros_envolvidos_magistrados: OutroEnvolvidoMagistradoWriteApi[];
  outros_envolvidos_testemunhas: OutroEnvolvidoTestemunhaApi[];
  outros_envolvidos_peritos: OutroEnvolvidoPeritoWriteApi[];
  outros_envolvidos_assistentes_tecnicos: OutroEnvolvidoAssistenteTecnicoApi[];
  /** Id do catálogo `tribunais` — `null` = sem tribunal escolhido. */
  tribunal_atual_id: number | null;
  /** Id do catálogo `orgao_julgador` (chave estrangeira) — `null` = sem órgão processante. */
  orgao_processante_id: number | null;
  escritorios_anteriores: string[];
  tags: string[];
}

/** Envelope de `PaginaResponse` (mesma forma de `advogado-api.model.ts`). */
export interface PaginaApi<T> {
  conteudo: T[];
  pagina: number;
  tamanho: number;
  total_elementos: number;
  total_paginas: number;
  ultima: boolean;
}
