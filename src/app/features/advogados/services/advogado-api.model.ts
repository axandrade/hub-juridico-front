import { EstadoCivil } from '../../../core/models';

/**
 * `AdvogadoResponse` do backend (`/api/v1/advogados`, Spring). JSON snake_case
 * (ver `JacksonConfig`), igual `ClientRespApi` — sem mapeamento pra um model
 * camelCase à parte porque a entidade é simples (sem herança/polimorfismo).
 */
export interface AdvogadoApi {
  id: number;
  favorito: boolean;
  nome: string;
  nacionalidade: string | null;
  estado_civil: EstadoCivil | null;
  profissao: string | null;
  oab: string | null;
  cpf: string | null;
  rg: string | null;
  email: string | null;
  telefone_whatsapp: string | null;
  endereco_profissional: string | null;
  cep_profissional: string | null;
  cidade_profissional: string | null;
  ativo: boolean;
  observacoes: string | null;
}

/** Envelope de `PaginaResponse` (mesma forma usada em `client-api.model.ts`). */
export interface PaginaApi<T> {
  conteudo: T[];
  pagina: number;
  tamanho: number;
  total_elementos: number;
  total_paginas: number;
  ultima: boolean;
}
