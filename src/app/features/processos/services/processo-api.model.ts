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
  data_distribuicao: string | null;
  ativo: boolean;
  atualizado_em: string | null;
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
