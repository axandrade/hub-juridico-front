import { EstadoCivil, TipoContato, TipoPessoa } from '../../../core/models';

/**
 * DTOs da API `/api/v1/pessoas` (Spring). O JSON do backend é **snake_case**
 * (ver `JacksonConfig`), então os nomes aqui são snake_case de propósito — a
 * conversão para/de `IClient` fica em `pessoa-mapper.ts`.
 */

// ---------- blocos comuns ----------

export interface EnderecoApi {
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  cep: string | null;
  uf: string | null;
}

export interface ContatoApi {
  valor: string;
  tipo: TipoContato;
  principal: boolean;
}

export interface EmailApi {
  endereco: string;
  principal: boolean;
}

export interface RepresentanteApi {
  nome: string;
  cpf: string;
  cargo: string | null;
  endereco: EnderecoApi | null;
  contatos: ContatoApi[];
  emails: EmailApi[];
}

export type StatusVinculoApi = 'ATIVO' | 'INATIVO';

export interface DadosAdministrativosApi {
  status: StatusVinculoApi | null;
  modalidade: string | null;
  numero_contrato: string;
  data_contrato: string | null; // ISO `yyyy-MM-dd`
  responsavel_interno: string;
  indicado_por: string | null;
  observacoes: string | null;
  caminho_arquivo: string | null;
}

// ---------- requisição (POST / PUT) ----------

interface PessoaRequestComum {
  endereco: EnderecoApi | null;
  contatos: ContatoApi[];
  emails: EmailApi[];
  dados_administrativos: DadosAdministrativosApi;
}

export interface CriarPessoaFisicaApi extends PessoaRequestComum {
  tipo: 'FISICA';
  nome: string;
  cpf: string;
  rg: string | null;
  estado_civil: EstadoCivil | null;
  nacionalidade: string | null;
}

export interface CriarPessoaJuridicaApi extends PessoaRequestComum {
  tipo: 'JURIDICA';
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string;
  inscricao_estadual: string | null;
  inscricao_municipal: string | null;
  representantes: RepresentanteApi[];
}

export type CriarPessoaApi = CriarPessoaFisicaApi | CriarPessoaJuridicaApi;

/** Atualização (PUT) — o backend não aceita alterar cpf/cnpj. */
export type AtualizarPessoaApi =
  Omit<CriarPessoaFisicaApi, 'cpf'> | Omit<CriarPessoaJuridicaApi, 'cnpj'>;

// ---------- resposta ----------

export interface RepresentanteRespApi extends RepresentanteApi {
  id: number;
}

export interface DadosAdministrativosRespApi extends DadosAdministrativosApi {
  cadastrado_por_id: number | null;
  cadastrado_por_nome: string | null;
  criado_em: string | null;
  atualizado_em: string | null;
}

/** `PessoaResponse` polimórfico (discriminado por `tipo`). */
export interface PessoaRespApi {
  tipo: TipoPessoa;
  id: number;
  // PessoaFisica
  nome?: string;
  cpf?: string;
  rg?: string;
  estado_civil?: EstadoCivil | null;
  nacionalidade?: string;
  // PessoaJuridica
  razao_social?: string;
  nome_fantasia?: string;
  cnpj?: string;
  inscricao_estadual?: string;
  inscricao_municipal?: string;
  representantes?: RepresentanteRespApi[];
  // comum
  favorito?: boolean;
  endereco: EnderecoApi | null;
  contatos: ContatoApi[];
  emails: EmailApi[];
  dados_administrativos: DadosAdministrativosRespApi;
}

/** Envelope de `PaginaResponse` (só `conteudo` é usado hoje). */
export interface PaginaApi<T> {
  conteudo: T[];
  pagina: number;
  tamanho: number;
  total_elementos: number;
  total_paginas: number;
  ultima: boolean;
}
