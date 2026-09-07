/**
 * Resumo da pasta de arquivos de um cliente — uma linha da tabela de visão geral do diálogo
 * "Abrir pasta do cliente" (`GET /api/v1/pastas/clientes`, `ClientePastaResumoResponse` no
 * backend). JSON snake_case (ver `JacksonConfig`).
 */

export type TipoPessoaResumo = 'FISICA' | 'JURIDICA';

export interface ClientePastaResumoApi {
  pessoa_id: number;
  nome: string;
  tipo: TipoPessoaResumo;
  qtd_pastas: number;
  qtd_documentos: number;
  tamanho_total_bytes: number;
  ultimo_envio_em: string | null;
}

export interface ClientePastaResumo {
  pessoaId: number;
  nome: string;
  tipo: TipoPessoaResumo;
  qtdPastas: number;
  qtdDocumentos: number;
  tamanhoTotalBytes: number;
  ultimoEnvioEm: Date | null;
}

export function resumoFromApi(api: ClientePastaResumoApi): ClientePastaResumo {
  return {
    pessoaId: api.pessoa_id,
    nome: api.nome,
    tipo: api.tipo,
    qtdPastas: api.qtd_pastas,
    qtdDocumentos: api.qtd_documentos,
    tamanhoTotalBytes: api.tamanho_total_bytes,
    ultimoEnvioEm: api.ultimo_envio_em ? new Date(api.ultimo_envio_em) : null,
  };
}
