import { HttpEvent } from '@angular/common/http';
import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

import { Documento, Pasta, PastaConteudo } from '../models/document-explorer.model';

/** Estado de um job de download de zip com percentual (`ZipDownloadJobResponse` no backend). */
export interface ZipJobApi {
  job_id: string;
  status: 'compactando' | 'pronto' | 'erro' | 'cancelado';
  nome_arquivo: string;
  total_arquivos: number;
  arquivos_processados: number;
  bytes_totais: number;
  bytes_processados: number;
}

/**
 * Progresso de um upload em andamento (`enviar`). `progresso` repete a cada pedaço enviado
 * (`enviados`/`total` em bytes); `concluido` fecha o fluxo com o `Documento` já criado.
 */
export type UploadEvento =
  | { tipo: 'progresso'; enviados: number; total: number }
  | { tipo: 'concluido'; documento: Documento };

/**
 * Forma comum de `DocumentsService` (Pessoa/cliente) e `MagistradoDocumentsService` — deixa
 * `DocumentExplorerComponent`/`TransfersService` reaproveitáveis pros dois donos sem duplicar
 * essas telas/serviços grandes. Cada diálogo (`pasta-cliente-dialog`/`pasta-magistrado-dialog`)
 * provê a implementação certa via {@link DOCUMENTS_PORT} no próprio `@Component` — DI
 * hierárquica do Angular, não generaliza nada no backend (que continua paralelo/independente).
 *
 * Os nomes dos parâmetros (`pessoaId` no serviço concreto) não importam aqui — TypeScript casa
 * por posição/tipo, então `DocumentsService` já implementa isto sem nenhuma mudança de código.
 */
export interface DocumentsPort {
  raiz(donoId: number): Observable<PastaConteudo>;
  conteudo(pastaId: string): Observable<PastaConteudo>;
  criarPasta(donoId: number, pastaPaiId: string | null, nome: string): Observable<Pasta>;
  renomearPasta(pastaId: string, nome: string): Observable<Pasta>;
  moverPasta(pastaId: string, novaPastaPaiId: string | null): Observable<Pasta>;
  excluirPasta(pastaId: string): Observable<void>;
  iniciarDownloadZip(pastaIds: string[], documentoIds: string[]): Observable<ZipJobApi>;
  statusDownloadZip(jobId: string): Observable<ZipJobApi>;
  baixarZipPronto(jobId: string): Observable<HttpEvent<Blob>>;
  cancelarDownloadZip(jobId: string): Observable<void>;
  renomearDocumento(documentoId: string, nome: string): Observable<Documento>;
  moverDocumento(documentoId: string, novaPastaId: string | null): Observable<Documento>;
  excluirDocumento(documentoId: string): Observable<void>;
  converterParaPdf(documentoId: string): Observable<Documento>;
  downloadUrl(documentoId: string): Observable<string>;
  editUrl(documentoId: string): Observable<string | null>;
  baixarBlob(documentoId: string): Observable<Blob>;
  enviar(donoId: number, pastaId: string | null, arquivo: File, tipoAnexo?: string): Observable<UploadEvento>;
}

/**
 * Token de DI pra {@link DocumentsPort} — cada diálogo de pasta provê a implementação certa
 * (`useExisting: DocumentsService` pro de cliente, `useClass: MagistradoDocumentsService` pro de
 * magistrado) no `providers` do próprio `@Component`, então `DocumentExplorerComponent`/
 * `TransfersService` (injetados dentro dessa árvore) resolvem o dono certo sem saber qual é.
 */
export const DOCUMENTS_PORT = new InjectionToken<DocumentsPort>('DocumentsPort');
