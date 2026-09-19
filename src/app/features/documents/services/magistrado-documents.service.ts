import { HttpClient, HttpEvent, HttpEventType, HttpUploadProgressEvent } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, concat, filter, firstValueFrom, map, startWith, switchMap } from 'rxjs';

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
import { DocumentsPort, UploadEvento, ZipJobApi } from './documents-port';

/**
 * Pastas e documentos de um Magistrado — cópia fiel de `DocumentsService` (que é de Pessoa/
 * cliente), estrutura paralela e independente por decisão do usuário. `/api/v1/pastas-magistrado`
 * e `/api/v1/documentos-magistrado` (Spring) em vez de `/pastas`/`documentos`. O binário nunca
 * passa pela API — mesmo fluxo de URL pré-assinada.
 */
@Injectable({ providedIn: 'root' })
export class MagistradoDocumentsService implements DocumentsPort {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  raiz(magistradoId: number): Observable<PastaConteudo> {
    return this.http
      .get<PastaConteudoApi>(`${this.base}/magistrados/${magistradoId}/pastas-magistrado/raiz`)
      .pipe(map(conteudoFromApi));
  }

  conteudo(pastaId: string): Observable<PastaConteudo> {
    return this.http
      .get<PastaConteudoApi>(`${this.base}/pastas-magistrado/${pastaId}/conteudo`)
      .pipe(map(conteudoFromApi));
  }

  criarPasta(magistradoId: number, pastaPaiId: string | null, nome: string): Observable<Pasta> {
    return this.http
      .post<PastaApi>(`${this.base}/pastas-magistrado`, {
        dono_id: magistradoId,
        pasta_pai_id: pastaPaiId,
        nome,
      })
      .pipe(map(pastaFromApi));
  }

  renomearPasta(pastaId: string, nome: string): Observable<Pasta> {
    return this.http
      .patch<PastaApi>(`${this.base}/pastas-magistrado/${pastaId}/renomear`, { nome })
      .pipe(map(pastaFromApi));
  }

  moverPasta(pastaId: string, novaPastaPaiId: string | null): Observable<Pasta> {
    return this.http
      .patch<PastaApi>(`${this.base}/pastas-magistrado/${pastaId}/mover`, { pasta_id: novaPastaPaiId })
      .pipe(map(pastaFromApi));
  }

  excluirPasta(pastaId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/pastas-magistrado/${pastaId}`);
  }

  iniciarDownloadZip(pastaIds: string[], documentoIds: string[]): Observable<ZipJobApi> {
    return this.http.post<ZipJobApi>(`${this.base}/pastas-magistrado/download-job`, {
      pasta_ids: pastaIds,
      documento_ids: documentoIds,
    });
  }

  statusDownloadZip(jobId: string): Observable<ZipJobApi> {
    return this.http.get<ZipJobApi>(`${this.base}/pastas-magistrado/download-job/${jobId}`);
  }

  baixarZipPronto(jobId: string): Observable<HttpEvent<Blob>> {
    return this.http.get(`${this.base}/pastas-magistrado/download-job/${jobId}/arquivo`, {
      observe: 'events',
      reportProgress: true,
      responseType: 'blob',
    });
  }

  cancelarDownloadZip(jobId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/pastas-magistrado/download-job/${jobId}`);
  }

  renomearDocumento(documentoId: string, nome: string): Observable<Documento> {
    return this.http
      .patch<DocumentoApi>(`${this.base}/documentos-magistrado/${documentoId}/renomear`, { nome })
      .pipe(map(documentoFromApi));
  }

  moverDocumento(documentoId: string, novaPastaId: string | null): Observable<Documento> {
    return this.http
      .patch<DocumentoApi>(`${this.base}/documentos-magistrado/${documentoId}/mover`, { pasta_id: novaPastaId })
      .pipe(map(documentoFromApi));
  }

  excluirDocumento(documentoId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/documentos-magistrado/${documentoId}`);
  }

  converterParaPdf(documentoId: string): Observable<Documento> {
    return this.http
      .post<DocumentoApi>(`${this.base}/documentos-magistrado/${documentoId}/converter-pdf`, {})
      .pipe(map(documentoFromApi));
  }

  downloadUrl(documentoId: string): Observable<string> {
    return this.http
      .get<DownloadUrlApi>(`${this.base}/documentos-magistrado/${documentoId}/download-url`)
      .pipe(map((resposta) => resposta.url));
  }

  editUrl(documentoId: string): Observable<string | null> {
    return this.http
      .get<DownloadUrlApi | null>(`${this.base}/documentos-magistrado/${documentoId}/edit-url`)
      .pipe(map((resposta) => resposta?.url ?? null));
  }

  baixarBlob(documentoId: string): Observable<Blob> {
    return this.downloadUrl(documentoId).pipe(switchMap((url) => this.http.get(url, { responseType: 'blob' })));
  }

  enviar(
    magistradoId: number,
    pastaId: string | null,
    arquivo: File,
    tipoAnexo?: string,
  ): Observable<UploadEvento> {
    return this.http
      .post<UploadUrlApi>(`${this.base}/documentos-magistrado/upload-url`, {
        dono_id: magistradoId,
        pasta_id: pastaId,
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
            map((enviados): UploadEvento => ({ tipo: 'progresso', enviados, total })),
          );
          const confirmar$ = this.http
            .post<DocumentoApi>(`${this.base}/documentos-magistrado/confirmar`, {
              dono_id: magistradoId,
              pasta_id: pastaId,
              storage_key: alvo.storage_key,
              nome_original: arquivo.name,
              content_type: arquivo.type,
              tamanho_bytes: arquivo.size,
              tipo_anexo: tipoAnexo?.trim() || null,
            })
            .pipe(map((doc): UploadEvento => ({ tipo: 'concluido', documento: documentoFromApi(doc) })));
          return concat(envio$, confirmar$);
        }),
      );
  }

  /** PUT único do arquivo inteiro (local/S3) — emite os bytes já enviados conforme o progresso. */
  private enviarUnico(alvo: UploadUrlApi, arquivo: File): Observable<number> {
    return this.http
      .request(alvo.http_method, alvo.upload_url, {
        body: arquivo,
        headers: { 'Content-Type': arquivo.type },
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

  /** Sessão de upload em blocos (OneDrive/Graph) — ver `DocumentsService.enviarEmBlocos`, mesma lógica. */
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
