import { HttpClient, HttpEvent, HttpEventType, HttpUploadProgressEvent } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, concat, filter, firstValueFrom, map, startWith, switchMap } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  Documento,
  DocumentoApi,
  DownloadUrlApi,
  UploadUrlApi,
  documentoFromApi,
} from '../../documents/models/document-explorer.model';

/** Ver `UploadEvento` de `DocumentsPort` — mesmo shape, cópia local pra não puxar o resto da porta. */
export type ComentarioUploadEvento =
  | { tipo: 'progresso'; enviados: number; total: number }
  | { tipo: 'concluido'; documento: Documento };

/**
 * Documentos anexados a um comentário de operação — lista simples (sem pastas, sem zip, sem
 * renomear/mover/converter-pdf/edit-url), decisão explícita do usuário: um comentário não navega
 * árvore de arquivos, só anexa/baixa/exclui. `/api/v1/documentos-comentario`, dono_id = id do
 * comentário, sempre na raiz (pasta_id null). Cópia própria por decisão de manter os serviços de
 * documento separados por dono (ver `MagistradoDocumentsService`/`DocumentsService`), mesmo sendo
 * bem menor que os outros por não implementar `DocumentsPort` inteira.
 */
@Injectable({ providedIn: 'root' })
export class ComentarioDocumentsService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  listar(comentarioId: number): Observable<Documento[]> {
    return this.http
      .get<DocumentoApi[]>(`${this.base}/documentos-comentario`, { params: { comentarioId } })
      .pipe(map((documentos) => documentos.map(documentoFromApi)));
  }

  excluir(documentoId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/documentos-comentario/${documentoId}`);
  }

  downloadUrl(documentoId: string): Observable<string> {
    return this.http
      .get<DownloadUrlApi>(`${this.base}/documentos-comentario/${documentoId}/download-url`)
      .pipe(map((resposta) => resposta.url));
  }

  enviar(comentarioId: number, arquivo: File): Observable<ComentarioUploadEvento> {
    return this.http
      .post<UploadUrlApi>(`${this.base}/documentos-comentario/upload-url`, {
        dono_id: comentarioId,
        pasta_id: null,
        content_type: arquivo.type,
        tamanho_bytes: arquivo.size,
      })
      .pipe(
        switchMap((alvo) => {
          const total = arquivo.size;
          const envio$ = (
            alvo.chunked ? this.enviarEmBlocos(alvo, arquivo) : this.enviarUnico(alvo, arquivo)
          ).pipe(
            startWith(0),
            map((enviados): ComentarioUploadEvento => ({ tipo: 'progresso', enviados, total })),
          );
          const confirmar$ = this.http
            .post<DocumentoApi>(`${this.base}/documentos-comentario/confirmar`, {
              dono_id: comentarioId,
              pasta_id: null,
              storage_key: alvo.storage_key,
              nome_original: arquivo.name,
              content_type: arquivo.type,
              tamanho_bytes: arquivo.size,
              tipo_anexo: null,
            })
            .pipe(map((doc): ComentarioUploadEvento => ({ tipo: 'concluido', documento: documentoFromApi(doc) })));
          return concat(envio$, confirmar$);
        }),
      );
  }

  /** PUT único do arquivo inteiro (local/S3) — emite os bytes já enviados conforme o progresso. */
  private enviarUnico(alvo: UploadUrlApi, arquivo: File): Observable<number> {
    return this.http
      .request(alvo.http_method, alvo.upload_url, {
        body: arquivo,
        headers: { 'Content-Type': arquivo.type, ...alvo.headers },
        responseType: 'text',
        observe: 'events',
        reportProgress: true,
      })
      .pipe(
        filter(
          (evento: HttpEvent<unknown>): evento is HttpUploadProgressEvent =>
            evento.type === HttpEventType.UploadProgress,
        ),
        map((evento) => evento.loaded),
      );
  }

  /** Sessão de upload em blocos (OneDrive/Graph) — ver `MagistradoDocumentsService.enviarEmBlocos`, mesma lógica. */
  private enviarEmBlocos(alvo: UploadUrlApi, arquivo: File): Observable<number> {
    return new Observable<number>((subscriber) => {
      let cancelado = false;
      const total = arquivo.size;
      const tamanhoBloco = alvo.chunk_size_bytes ?? total;
      (async () => {
        try {
          for (let inicio = 0; inicio < total; inicio += tamanhoBloco) {
            if (cancelado) {
              return;
            }
            const fim = Math.min(inicio + tamanhoBloco, total);
            await firstValueFrom(
              this.http.put(alvo.upload_url, arquivo.slice(inicio, fim), {
                headers: { 'Content-Range': `bytes ${inicio}-${fim - 1}/${total}` },
                responseType: 'text',
              }),
            );
            subscriber.next(fim);
          }
          subscriber.complete();
        } catch (erro) {
          subscriber.error(erro);
        }
      })();
      return () => {
        cancelado = true;
      };
    });
  }
}
