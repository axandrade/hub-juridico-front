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
 * Um magistrado "outro envolvido" (aba "Outros envolvidos", seção "Magistrados"). `magistrado` e
 * `data` (ISO `yyyy-MM-dd`) são obrigatórios; `resultado`/`orgao` são o texto dos catálogos.
 */
export interface OutroEnvolvidoMagistradoApi {
  magistrado: string;
  resultado: string | null;
  orgao: string | null;
  data: string;
}

/**
 * Uma testemunha "outra envolvida" (aba "Outros envolvidos", seção "Testemunhas"). Os dois campos
 * são obrigatórios; `parte_interessada` é o texto do catálogo `ParteInteressada`.
 */
export interface OutroEnvolvidoTestemunhaApi {
  testemunha: string;
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

/** `ProcessoResumoResponse` — uma linha da listagem (só escalares, sem as coleções). */
export interface ProcessoResumoApi {
  id: number;
  favorito: boolean;
  tipo: TipoProcesso;
  numero_cnj: string | null;
  status: string | null;
  pasta: string | null;
  cliente_principal_id: number | null;
  advogado_responsavel_id: number | null;
  natureza: string | null;
  fase: string | null;
  uf: string | null;
  cidade: string | null;
  cidade_id: number | null;
  data_distribuicao: string | null;
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
  pasta: string | null;

  cliente_principal_id: number | null;
  cliente_principal_posicao: string | null;

  contrario_principal_nome: string | null;
  contrario_principal_posicao: string | null;
  contrario_principal_documento: string | null;

  advogado_responsavel_id: number | null;
  data_distribuicao: string | null;
  acao: string | null;
  natureza: string | null;
  procedimento: string | null;
  fase: string | null;
  uf: string | null;
  cidade: string | null;
  cidade_id: number | null;
  observacoes_gerais: string | null;

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
  orgaos_processantes: string[];
  escritorios_anteriores: string[];
  tags: string[];

  ativo: boolean;
  atualizado_em: string | null;
}

/** Corpo do `POST` / `PUT` de processo (`ProcessoRequest` no backend) — snake_case. */
export interface ProcessoWriteApi {
  tipo: TipoProcesso;
  numero_cnj: string | null;
  status: string | null;

  cliente_principal_id: number | null;
  cliente_principal_posicao: string | null;

  contrario_principal_nome: string | null;
  contrario_principal_posicao: string | null;
  contrario_principal_documento: string | null;

  advogado_responsavel_id: number | null;
  data_distribuicao: string | null;
  acao: string | null;
  natureza: string | null;
  procedimento: string | null;
  fase: string | null;
  uf: string | null;
  cidade_id: number | null;
  observacoes_gerais: string | null;

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
  orgaos_processantes: string[];
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
