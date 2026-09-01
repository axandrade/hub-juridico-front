/** `PessoaArquivoResponse` do backend — JSON snake_case (ver `JacksonConfig`). */
export interface PessoaArquivoApi {
  id: number;
  nome_arquivo: string;
  content_type: string | null;
  tamanho_bytes: number;
  data_upload: string;
}

/** Metadados de um arquivo de pessoa no frontend. */
export interface PessoaArquivo {
  id: number;
  nome: string;
  contentType: string;
  tamanhoBytes: number;
  dataUpload: Date;
}

export function pessoaArquivoFromApi(api: PessoaArquivoApi): PessoaArquivo {
  return {
    id: api.id,
    nome: api.nome_arquivo,
    contentType: api.content_type ?? '',
    tamanhoBytes: api.tamanho_bytes,
    dataUpload: new Date(api.data_upload),
  };
}
