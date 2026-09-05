/** `PastaResponse`/`DocumentoResponse`/etc. do backend — JSON snake_case (ver `JacksonConfig`). */

export interface BreadcrumbItemApi {
  id: string;
  nome: string;
}

export interface PastaApi {
  id: string;
  pasta_pai_id: string | null;
  nome: string;
  criado_em: string;
  atualizado_em: string;
}

export interface DocumentoApi {
  id: string;
  pasta_id: string | null;
  nome_original: string;
  content_type: string | null;
  tamanho_bytes: number | null;
  enviado_em: string;
}

export interface PastaConteudoApi {
  breadcrumb: BreadcrumbItemApi[];
  subpastas: PastaApi[];
  documentos: DocumentoApi[];
}

export interface UploadUrlApi {
  storage_key: string;
  upload_url: string;
  http_method: string;
  expires_in_seconds: number;
}

export interface DownloadUrlApi {
  url: string;
}

export interface BreadcrumbItem {
  id: string;
  nome: string;
}

export interface Pasta {
  id: string;
  pastaPaiId: string | null;
  nome: string;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface Documento {
  id: string;
  pastaId: string | null;
  nome: string;
  contentType: string | null;
  tamanhoBytes: number | null;
  enviadoEm: Date;
}

/** Pasta atual (ou raiz), com o caminho até ela e o conteúdo direto — resposta única do backend. */
export interface PastaConteudo {
  breadcrumb: BreadcrumbItem[];
  subpastas: Pasta[];
  documentos: Documento[];
}

export function pastaFromApi(api: PastaApi): Pasta {
  return {
    id: api.id,
    pastaPaiId: api.pasta_pai_id,
    nome: api.nome,
    criadoEm: new Date(api.criado_em),
    atualizadoEm: new Date(api.atualizado_em),
  };
}

export function documentoFromApi(api: DocumentoApi): Documento {
  return {
    id: api.id,
    pastaId: api.pasta_id,
    nome: api.nome_original,
    contentType: api.content_type,
    tamanhoBytes: api.tamanho_bytes,
    enviadoEm: new Date(api.enviado_em),
  };
}

export function conteudoFromApi(api: PastaConteudoApi): PastaConteudo {
  return {
    breadcrumb: api.breadcrumb.map((item) => ({ id: item.id, nome: item.nome })),
    subpastas: api.subpastas.map(pastaFromApi),
    documentos: api.documentos.map(documentoFromApi),
  };
}
