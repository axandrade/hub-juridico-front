import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom, from, map, switchMap } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  Documento,
  DocumentoApi,
  DownloadUrlApi,
  Pasta,
  PastaApi,
  PastaConteudo,
  PastaConteudoApi,
  UploadUrlApi,
  conteudoFromApi,
  documentoFromApi,
  pastaFromApi,
} from '../models/document-explorer.model';

/** Espelha `storage.allowed-content-types` do backend (ver `application.yml`) — mantido em sync manualmente. */
export const TIPOS_ACEITOS = [
  'application/pdf',
  'image/jpeg',
  'application/msword',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

/**
 * Extensão → content-type dos formatos aceitos. Fallback quando o navegador não reporta o MIME
 * (comum com `.doc`, `.xls`, `.odt`, onde `File.type` vem vazio) — ver `resolverTipoAceito`.
 */
const TIPO_POR_EXTENSAO: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** Content-type efetivo do arquivo se for um formato aceito (pelo MIME ou pela extensão), senão `null`. */
export function resolverTipoAceito(arquivo: File): string | null {
  if (arquivo.type && TIPOS_ACEITOS.includes(arquivo.type)) {
    return arquivo.type;
  }
  const ext = arquivo.name.split('.').pop()?.toLowerCase() ?? '';
  return TIPO_POR_EXTENSAO[ext] ?? null;
}

/**
 * Pastas e documentos de uma pessoa (cliente) — `/api/v1/pastas` e `/api/v1/documentos`
 * (Spring). O binário nunca passa pela API: `enviar()` faz o fluxo completo (pede a URL
 * pré-assinada, envia o arquivo cru pra ela, confirma os metadados) e `downloadUrl()` devolve
 * uma URL pronta pra navegação direta — nunca busca o binário via `HttpClient`.
 */
@Injectable({ providedIn: 'root' })
export class DocumentsService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  raiz(pessoaId: number): Observable<PastaConteudo> {
    return this.http
      .get<PastaConteudoApi>(`${this.base}/pessoas/${pessoaId}/pastas/raiz`)
      .pipe(map(conteudoFromApi));
  }

  conteudo(pastaId: string): Observable<PastaConteudo> {
    return this.http
      .get<PastaConteudoApi>(`${this.base}/pastas/${pastaId}/conteudo`)
      .pipe(map(conteudoFromApi));
  }

  criarPasta(pessoaId: number, pastaPaiId: string | null, nome: string): Observable<Pasta> {
    return this.http
      .post<PastaApi>(`${this.base}/pastas`, { pessoa_id: pessoaId, pasta_pai_id: pastaPaiId, nome })
      .pipe(map(pastaFromApi));
  }

  renomearPasta(pastaId: string, nome: string): Observable<Pasta> {
    return this.http
      .patch<PastaApi>(`${this.base}/pastas/${pastaId}/renomear`, { nome })
      .pipe(map(pastaFromApi));
  }

  moverPasta(pastaId: string, novaPastaPaiId: string | null): Observable<Pasta> {
    return this.http
      .patch<PastaApi>(`${this.base}/pastas/${pastaId}/mover`, { pasta_id: novaPastaPaiId })
      .pipe(map(pastaFromApi));
  }

  excluirPasta(pastaId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/pastas/${pastaId}`);
  }

  /**
   * Baixa a pasta inteira (subpastas + documentos, recursivamente) como um `.zip`. Diferente do
   * download de documento, aqui o binário passa pela API (streaming), então vem como blob com o
   * JWT anexado pelo interceptor.
   */
  baixarPastaZip(pastaId: string): Observable<Blob> {
    return this.http.get(`${this.base}/pastas/${pastaId}/download`, { responseType: 'blob' });
  }

  renomearDocumento(documentoId: string, nome: string): Observable<Documento> {
    return this.http
      .patch<DocumentoApi>(`${this.base}/documentos/${documentoId}/renomear`, { nome })
      .pipe(map(documentoFromApi));
  }

  moverDocumento(documentoId: string, novaPastaId: string | null): Observable<Documento> {
    return this.http
      .patch<DocumentoApi>(`${this.base}/documentos/${documentoId}/mover`, { pasta_id: novaPastaId })
      .pipe(map(documentoFromApi));
  }

  excluirDocumento(documentoId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/documentos/${documentoId}`);
  }

  downloadUrl(documentoId: string): Observable<string> {
    return this.http
      .get<DownloadUrlApi>(`${this.base}/documentos/${documentoId}/download-url`)
      .pipe(map((resposta) => resposta.url));
  }

  /**
   * Link pra editar no editor da nuvem (Word/Excel/PowerPoint Online) — só quando o provedor de
   * armazenamento ativo suportar (hoje só OneDrive). `null` quando não suportado (backend devolve
   * 204 sem corpo).
   */
  editUrl(documentoId: string): Observable<string | null> {
    return this.http
      .get<DownloadUrlApi | null>(`${this.base}/documentos/${documentoId}/edit-url`)
      .pipe(map((resposta) => resposta?.url ?? null));
  }

  /**
   * Busca o binário como blob — usado só pra visualizar (PDF em nova aba, DOCX renderizado no
   * navegador). A URL de download tem `Content-Disposition: attachment` (força "Salvar como"),
   * mas isso só vale pra navegação direta; buscando como blob e criando uma Object URL local a
   * gente ignora esse header e decide como mostrar.
   */
  baixarBlob(documentoId: string): Observable<Blob> {
    return this.downloadUrl(documentoId).pipe(switchMap((url) => this.http.get(url, { responseType: 'blob' })));
  }

  /** Fluxo completo de envio: pede a URL pré-assinada, envia o binário cru, confirma os metadados. */
  enviar(pessoaId: number, pastaId: string | null, arquivo: File): Observable<Documento> {
    return this.http
      .post<UploadUrlApi>(`${this.base}/documentos/upload-url`, {
        pessoa_id: pessoaId,
        pasta_id: pastaId,
        content_type: arquivo.type,
        tamanho_bytes: arquivo.size,
      })
      .pipe(
        switchMap((alvo) =>
          (alvo.chunked ? this.enviarEmBlocos(alvo, arquivo) : this.enviarUnico(alvo, arquivo)).pipe(
            switchMap(() =>
              this.http.post<DocumentoApi>(`${this.base}/documentos/confirmar`, {
                pessoa_id: pessoaId,
                pasta_id: pastaId,
                storage_key: alvo.storage_key,
                nome_original: arquivo.name,
                content_type: arquivo.type,
                tamanho_bytes: arquivo.size,
              }),
            ),
          ),
        ),
        map(documentoFromApi),
      );
  }

  /** PUT único do arquivo inteiro — local/S3. */
  private enviarUnico(alvo: UploadUrlApi, arquivo: File): Observable<unknown> {
    return this.http.request(alvo.http_method, alvo.upload_url, {
      body: arquivo,
      headers: { 'Content-Type': arquivo.type },
      responseType: 'text',
    });
  }

  /**
   * Sessão de upload em blocos (OneDrive/Graph, ver `UploadUrlApi.chunked`): a mesma `upload_url`
   * recebe vários PUTs sequenciais, cada um com `Content-Range` marcando o pedaço enviado. Precisa
   * ser sequencial (o Graph exige os blocos em ordem) — por isso `async/await` em vez de RxJS puro.
   */
  private enviarEmBlocos(alvo: UploadUrlApi, arquivo: File): Observable<unknown> {
    return from(this.enviarBlocosSequencial(alvo.upload_url, arquivo, alvo.chunk_size_bytes ?? arquivo.size));
  }

  private async enviarBlocosSequencial(url: string, arquivo: File, tamanhoBloco: number): Promise<void> {
    const total = arquivo.size;
    for (let inicio = 0; inicio < total; inicio += tamanhoBloco) {
      const fim = Math.min(inicio + tamanhoBloco, total);
      const bloco = arquivo.slice(inicio, fim);
      await firstValueFrom(
        this.http.put(url, bloco, {
          headers: { 'Content-Range': `bytes ${inicio}-${fim - 1}/${total}` },
          responseType: 'text',
        }),
      );
    }
  }
}
