/** Tipos de arquivo aceitos pelo backend (`com.hubjuridico.dominio.enums.TipoArquivo`). */
export type TipoArquivo = 'PRINCIPAL' | 'CONTRATO';

export const TIPO_ARQUIVO_LABEL: Record<TipoArquivo, string> = {
  PRINCIPAL: 'Arquivo principal',
  CONTRATO: 'Contrato',
};

/** `PessoaArquivoResponse` do backend — JSON snake_case (ver `JacksonConfig`). */
export interface PessoaArquivoApi {
  id: number;
  nome_arquivo: string;
  tipo: TipoArquivo;
  content_type: string | null;
  tamanho_bytes: number;
  data_upload: string;
}

/** Metadados de um arquivo de pessoa no frontend. */
export interface PessoaArquivo {
  id: number;
  nome: string;
  tipo: TipoArquivo;
  contentType: string;
  tamanhoBytes: number;
  dataUpload: Date;
}

export function pessoaArquivoFromApi(api: PessoaArquivoApi): PessoaArquivo {
  return {
    id: api.id,
    nome: api.nome_arquivo,
    tipo: api.tipo,
    contentType: api.content_type ?? '',
    tamanhoBytes: api.tamanho_bytes,
    dataUpload: new Date(api.data_upload),
  };
}
