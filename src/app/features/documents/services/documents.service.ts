import { HttpClient, HttpEvent, HttpEventType, HttpUploadProgressEvent } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, concat, filter, firstValueFrom, forkJoin, map, of, startWith, switchMap } from 'rxjs';

import { DomainService } from '../../../core/services/domain.service';
import { environment } from '../../../../environments/environment';
import {
  BreadcrumbItem,
  Documento,
  DocumentoApi,
  DownloadUrlApi,
  Pasta,
  PastaApi,
  PastaConteudo,
  UploadUrlApi,
  documentoFromApi,
  pastaFromApi,
} from '../models/document-explorer.model';
import { DocumentsPort, UploadEvento, ZipJobApi } from './documents-port';

/**
 * Shape cru de `/domain/pasta-pessoa` e `/domain/documento-pessoa` (ddd-noap) — camelCase, nome
 * literal do campo Java, diferente do `PastaApi`/`DocumentoApi` (snake_case, DTO do
 * `PastaPessoaController`/`DocumentoPessoaController` escritos à mão, ainda usados pelas
 * operações de escrita abaixo — só a LEITURA (`raiz`/`conteudo`) migrou pro genérico).
 */
interface PastaDomain {
  id: string;
  pastaPaiId?: string | null;
  nome: string;
  criadoEm: string;
  atualizadoEm: string;
}

interface DocumentoDomain {
  id: string;
  pastaId?: string | null;
  nomeOriginal: string;
  contentType?: string | null;
  tamanhoBytes?: number | null;
  enviadoEm: string;
}

function pastaFromDomain(d: PastaDomain): Pasta {
  return {
    id: d.id,
    pastaPaiId: d.pastaPaiId ?? null,
    nome: d.nome,
    criadoEm: new Date(d.criadoEm),
    atualizadoEm: new Date(d.atualizadoEm),
  };
}

function documentoFromDomain(d: DocumentoDomain): Documento {
  return {
    id: d.id,
    pastaId: d.pastaId ?? null,
    nome: d.nomeOriginal,
    contentType: d.contentType ?? null,
    tamanhoBytes: d.tamanhoBytes ?? null,
    enviadoEm: new Date(d.enviadoEm),
  };
}

export type { UploadEvento, ZipJobApi };

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
export class DocumentsService implements DocumentsPort {
  private readonly http = inject(HttpClient);
  private readonly domainService = inject(DomainService);
  private readonly base = environment.apiBaseUrl;

  private static readonly CAMPOS_PASTA = 'id,pastaPaiId,nome,criadoEm,atualizadoEm';
  private static readonly CAMPOS_DOCUMENTO = 'id,pastaId,nomeOriginal,contentType,tamanhoBytes,enviadoEm';

  /**
   * Raiz de uma pessoa: sem breadcrumb (não tem "pasta atual" — mesma semântica de
   * `FolderPessoaService.listRootContent`). Migrado pro `/domain/pasta-pessoa` +
   * `/domain/documento-pessoa` — leitura pura, sem regra de negócio, então dá pra genericizar
   * com segurança (diferente do upload/mover/renomear, que ficam no `PastaPessoaController`/
   * `DocumentoPessoaController` escritos à mão — ver decisão nessa sessão). `all: true` porque
   * o endpoint original devolve a lista inteira sem paginação (`findByXxx` puro).
   */
  raiz(pessoaId: number): Observable<PastaConteudo> {
    return forkJoin({
      subpastas: this.domainService.get<PastaDomain[]>({
        entityName: 'pasta-pessoa',
        all: true,
        fields: DocumentsService.CAMPOS_PASTA,
        filter: `pessoaId eq ${pessoaId} and pastaPaiId eq null and excluidoEm eq null`,
        sort: 'nome',
      }),
      documentos: this.domainService.get<DocumentoDomain[]>({
        entityName: 'documento-pessoa',
        all: true,
        fields: DocumentsService.CAMPOS_DOCUMENTO,
        filter: `pessoaId eq ${pessoaId} and pastaId eq null and excluidoEm eq null`,
        sort: 'nomeOriginal',
      }),
    }).pipe(
      map(({ subpastas, documentos }) => ({
        breadcrumb: [],
        subpastas: subpastas.map(pastaFromDomain),
        documentos: documentos.map(documentoFromDomain),
      })),
    );
  }

  /**
   * Conteúdo de uma pasta: breadcrumb (raiz→atual, inclusive) + subpastas + documentos diretos.
   * `pessoaId` não precisa entrar no filtro de subpastas/documentos — `pastaId` já identifica a
   * pasta-mãe de forma única, então filtrar só por ela já é equivalente ao
   * `findByPessoaIdAndPastaPaiId...` original (a integridade pessoa_id/pasta_pai_id é garantida
   * na criação, nunca haveria filho com pessoa_id diferente do pai).
   */
  conteudo(pastaId: string): Observable<PastaConteudo> {
    return forkJoin({
      breadcrumb: this.buscarBreadcrumb(pastaId),
      subpastas: this.domainService.get<PastaDomain[]>({
        entityName: 'pasta-pessoa',
        all: true,
        fields: DocumentsService.CAMPOS_PASTA,
        filter: `pastaPaiId eq ${pastaId} and excluidoEm eq null`,
        sort: 'nome',
      }),
      documentos: this.domainService.get<DocumentoDomain[]>({
        entityName: 'documento-pessoa',
        all: true,
        fields: DocumentsService.CAMPOS_DOCUMENTO,
        filter: `pastaId eq ${pastaId} and excluidoEm eq null`,
        sort: 'nomeOriginal',
      }),
    }).pipe(
      map(({ breadcrumb, subpastas, documentos }) => ({
        breadcrumb,
        subpastas: subpastas.map(pastaFromDomain),
        documentos: documentos.map(documentoFromDomain),
      })),
    );
  }

  /**
   * Caminho raiz→`pastaId` (inclusive) subindo por `pastaPaiId`, um `GET` por nível — equivalente
   * à CTE recursiva `PastaPessoaRepository.buscarBreadcrumb`, que o `/domain` genérico não sabe
   * fazer (sem suporte a recursão). Pastas raramente passam de 3-4 níveis, então isso continua
   * poucas chamadas sequenciais, não um problema de performance.
   */
  private buscarBreadcrumb(pastaId: string): Observable<BreadcrumbItem[]> {
    return this.domainService
      .get<{ id: string; nome: string; pastaPaiId: string | null }>({
        entityName: 'pasta-pessoa',
        entityId: pastaId,
        fields: 'id,nome,pastaPaiId',
      })
      .pipe(
        switchMap((pasta) => {
          const item: BreadcrumbItem = { id: pasta.id, nome: pasta.nome };
          if (!pasta.pastaPaiId) {
            return of([item]);
          }
          return this.buscarBreadcrumb(pasta.pastaPaiId).pipe(map((acumulado) => [...acumulado, item]));
        }),
      );
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
   * Cria um job de download de zip (pasta/seleção) com percentual — o zip é montado no servidor em
   * background. Ver `TransfersService`, que faz o polling do progresso e baixa quando fica pronto.
   */
  iniciarDownloadZip(pastaIds: string[], documentoIds: string[]): Observable<ZipJobApi> {
    return this.http.post<ZipJobApi>(`${this.base}/pastas/download-job`, {
      pasta_ids: pastaIds,
      documento_ids: documentoIds,
    });
  }

  /** Estado atual de um job de download (polling). */
  statusDownloadZip(jobId: string): Observable<ZipJobApi> {
    return this.http.get<ZipJobApi>(`${this.base}/pastas/download-job/${jobId}`);
  }

  /** Baixa o zip já pronto — resposta com `Content-Length`, então o progresso desta fase é real. */
  baixarZipPronto(jobId: string): Observable<HttpEvent<Blob>> {
    return this.http.get(`${this.base}/pastas/download-job/${jobId}/arquivo`, {
      observe: 'events',
      reportProgress: true,
      responseType: 'blob',
    });
  }

  /** Cancela o job: para a geração no servidor e apaga o zip temporário. */
  cancelarDownloadZip(jobId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/pastas/download-job/${jobId}`);
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

  /**
   * Converte o documento (imagem JPG ou Word) para PDF no backend e devolve o novo documento
   * PDF, já criado na mesma pasta do original (que é mantido).
   */
  converterParaPdf(documentoId: string): Observable<Documento> {
    return this.http
      .post<DocumentoApi>(`${this.base}/documentos/${documentoId}/converter-pdf`, {})
      .pipe(map(documentoFromApi));
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

  /**
   * Fluxo completo de envio: pede a URL pré-assinada, envia o binário cru, confirma os metadados.
   * `tipoAnexo` (opcional) é o item do catálogo escolhido — o servidor monta o nome de exibição
   * "dd/MM/yyyy (HH:mm) | Anexo: {tipo} | {nome}".
   *
   * Emite `{ tipo: 'progresso' }` conforme o binário sobe (para o percentual da bandeja de
   * transferências) e fecha com `{ tipo: 'concluido', documento }`.
   */
  enviar(
    pessoaId: number,
    pastaId: string | null,
    arquivo: File,
    tipoAnexo?: string,
  ): Observable<UploadEvento> {
    return this.http
      .post<UploadUrlApi>(`${this.base}/documentos/upload-url`, {
        pessoa_id: pessoaId,
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
            .post<DocumentoApi>(`${this.base}/documentos/confirmar`, {
              pessoa_id: pessoaId,
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

  /**
   * Sessão de upload em blocos (OneDrive/Graph, ver `UploadUrlApi.chunked`): a mesma `upload_url`
   * recebe vários PUTs sequenciais, cada um com `Content-Range` marcando o pedaço enviado. Precisa
   * ser sequencial (o Graph exige os blocos em ordem) — por isso `async/await` em vez de RxJS puro.
   * Emite o total acumulado de bytes a cada bloco confirmado e aborta entre blocos se a inscrição
   * for cancelada.
   */
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
