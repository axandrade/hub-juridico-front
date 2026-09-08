import { HttpEventType } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, Subscription, last, switchMap, takeWhile, tap, timer } from 'rxjs';

import {
  DocumentsService,
  UploadEvento,
  ZipJobApi,
} from '../../features/documents/services/documents.service';
import { Documento } from '../../features/documents/models/document-explorer.model';

export type TransferDirection = 'download' | 'upload';

export type TransferStatus =
  | 'preparando'
  | 'compactando'
  | 'baixando'
  | 'enviando'
  | 'concluido'
  | 'erro'
  | 'cancelado';

export interface TransferTask {
  readonly id: string;
  readonly tipo: TransferDirection;
  /** Nome exibido na bandeja (ex.: `Processo.zip` no download, `contrato.pdf` no upload). */
  readonly nome: string;
  status: TransferStatus;
  /** Só nos downloads de zip — quantos itens já entraram no pacote. */
  totalArquivos: number;
  arquivosProcessados: number;
  /** 0..1, ou `null` quando não dá pra calcular (ex.: sem tamanho total). */
  progresso: number | null;
}

/** Intervalo do polling do progresso da compactação, no servidor. */
export const POLL_MS = 900;

const ATIVA = (t: TransferTask): boolean =>
  t.status === 'preparando' ||
  t.status === 'compactando' ||
  t.status === 'baixando' ||
  t.status === 'enviando';

/**
 * Bandeja de transferências no canto inferior direito (estilo Google Drive), com percentual real.
 * Reúne downloads e uploads:
 *
 * <ul>
 *   <li><b>Download de zip</b> (`baixarZip`): o zip é montado no servidor (job assíncrono) — cria-se
 *   o job, faz-se polling da compactação e, quando fica pronto, baixa-se o arquivo já completo
 *   (com `Content-Length`, então essa fase também tem %).</li>
 *   <li><b>Upload</b> (`enviar`): acompanha o envio direto pro armazenamento (PUT único ou sessão em
 *   blocos, ver `DocumentsService.enviar`), com o percentual vindo dos eventos de progresso.</li>
 * </ul>
 *
 * Nada disso trava a tela, e a bandeja sobrevive à navegação entre telas.
 */
@Injectable({ providedIn: 'root' })
export class TransfersService {
  private readonly docs = inject(DocumentsService);

  private readonly _tarefas = signal<TransferTask[]>([]);
  readonly tarefas = this._tarefas.asReadonly();
  readonly quantidadeAtivas = computed(() => this._tarefas().filter(ATIVA).length);

  /** Assinatura viva + id do job no servidor, por tarefa — pra cancelar dos dois lados. */
  private readonly registro = new Map<string, { sub: Subscription | null; jobId: string | null }>();

  /**
   * Inicia o download de um zip (pasta e/ou documentos) e o acompanha numa tarefa da bandeja.
   * `nome` é o nome do arquivo final (`.zip` incluso).
   */
  baixarZip(nome: string, pastaIds: string[], documentoIds: string[]): string {
    const id = this.novoId();
    this._tarefas.update((tarefas) => [
      this.tarefaNova(id, 'download', nome, 'preparando'),
      ...tarefas,
    ]);
    this.registro.set(id, { sub: null, jobId: null });

    const sub = this.docs.iniciarDownloadZip(pastaIds, documentoIds).subscribe({
      next: (job) => {
        const reg = this.registro.get(id);
        if (!reg) {
          return; // já cancelada
        }
        reg.jobId = job.job_id;
        this.aplicarCompactacao(id, job);
        this.acompanharCompactacao(id, job.job_id);
      },
      error: () => this.marcar(id, 'erro'),
    });
    this.registro.get(id)!.sub = sub;
    return id;
  }

  /**
   * Acompanha um upload já em curso numa tarefa da bandeja. `nome` é o nome exibido (o do arquivo);
   * `envio$` vem de `DocumentsService.enviar`. `aoConcluir` roda com o `Documento` criado quando o
   * envio termina — a tela usa isso pra recarregar a listagem. O upload segue mesmo que a tela que
   * o disparou seja fechada.
   */
  enviar(nome: string, envio$: Observable<UploadEvento>, aoConcluir?: (documento: Documento) => void): string {
    const id = this.novoId();
    this._tarefas.update((tarefas) => [
      this.tarefaNova(id, 'upload', nome, 'enviando', 0),
      ...tarefas,
    ]);
    this.registro.set(id, { sub: null, jobId: null });

    const sub = envio$.subscribe({
      next: (evento) => {
        if (evento.tipo === 'progresso') {
          this.atualizar(id, {
            progresso: evento.total > 0 ? evento.enviados / evento.total : null,
          });
        } else {
          this.atualizar(id, { status: 'concluido', progresso: 1 });
          this.registro.delete(id);
          aoConcluir?.(evento.documento);
        }
      },
      error: () => this.marcar(id, 'erro'),
    });
    this.registro.get(id)!.sub = sub;
    return id;
  }

  /** Aborta a transferência (polling, download ou upload) e, no download, manda o servidor descartar o job. */
  cancelar(id: string): void {
    const reg = this.registro.get(id);
    reg?.sub?.unsubscribe();
    if (reg?.jobId) {
      this.docs.cancelarDownloadZip(reg.jobId).subscribe({ error: () => undefined });
    }
    this.registro.delete(id);
    this.atualizar(id, { status: 'cancelado', progresso: null });
  }

  /** Remove a tarefa da lista (aborta antes, se ainda ativa). */
  remover(id: string): void {
    const reg = this.registro.get(id);
    reg?.sub?.unsubscribe();
    this.registro.delete(id);
    this._tarefas.update((tarefas) => tarefas.filter((t) => t.id !== id));
  }

  /** Tira da lista tudo que já terminou (concluído / erro / cancelado). */
  limparEncerradas(): void {
    this._tarefas.update((tarefas) => tarefas.filter(ATIVA));
  }

  // ------------------------------------------------------------------

  private acompanharCompactacao(id: string, jobId: string): void {
    const sub = timer(POLL_MS, POLL_MS)
      .pipe(
        switchMap(() => this.docs.statusDownloadZip(jobId)),
        tap((job) => this.aplicarCompactacao(id, job)),
        takeWhile((job) => job.status === 'compactando', true),
        last(),
      )
      .subscribe({
        next: (job) => {
          if (job.status === 'pronto') {
            this.baixarPronto(id, jobId);
          } else if (job.status === 'erro') {
            this.marcar(id, 'erro');
          } else if (job.status === 'cancelado') {
            this.marcar(id, 'cancelado');
          }
        },
        error: () => this.marcar(id, 'erro'),
      });

    const reg = this.registro.get(id);
    if (reg) {
      reg.sub = sub;
    }
  }

  private baixarPronto(id: string, jobId: string): void {
    this.atualizar(id, { status: 'baixando', progresso: 0 });

    const sub = this.docs.baixarZipPronto(jobId).subscribe({
      next: (evento) => {
        if (evento.type === HttpEventType.DownloadProgress) {
          this.atualizar(id, {
            progresso: evento.total ? evento.loaded / evento.total : null,
          });
        } else if (evento.type === HttpEventType.Response) {
          const tarefa = this._tarefas().find((t) => t.id === id);
          this.salvarBlob(evento.body ?? new Blob(), tarefa?.nome ?? 'download.zip');
          this.atualizar(id, { status: 'concluido', progresso: 1 });
          this.docs.cancelarDownloadZip(jobId).subscribe({ error: () => undefined }); // limpa o temp
          this.registro.delete(id);
        }
      },
      error: () => this.marcar(id, 'erro'),
    });

    const reg = this.registro.get(id);
    if (reg) {
      reg.sub = sub;
    }
  }

  private aplicarCompactacao(id: string, job: ZipJobApi): void {
    this.atualizar(id, {
      status: 'compactando',
      totalArquivos: job.total_arquivos,
      arquivosProcessados: job.arquivos_processados,
      progresso: job.bytes_totais > 0 ? job.bytes_processados / job.bytes_totais : null,
    });
  }

  private tarefaNova(
    id: string,
    tipo: TransferDirection,
    nome: string,
    status: TransferStatus,
    progresso: number | null = null,
  ): TransferTask {
    return { id, tipo, nome, status, totalArquivos: 0, arquivosProcessados: 0, progresso };
  }

  private marcar(id: string, status: TransferStatus): void {
    this.registro.delete(id);
    this.atualizar(id, { status });
  }

  private atualizar(id: string, patch: Partial<TransferTask>): void {
    this._tarefas.update((tarefas) => tarefas.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  private novoId(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `tr-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  private salvarBlob(blob: Blob, nomeArquivo: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nomeArquivo;
    link.click();
    URL.revokeObjectURL(url);
  }
}
