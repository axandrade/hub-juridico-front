import { HttpEventType } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Subscription, last, switchMap, takeWhile, tap, timer } from 'rxjs';

import { DocumentsService, ZipJobApi } from '../../features/documents/services/documents.service';

export type DownloadStatus =
  | 'preparando'
  | 'compactando'
  | 'baixando'
  | 'concluido'
  | 'erro'
  | 'cancelado';

export interface DownloadTask {
  readonly id: string;
  /** Nome do arquivo final salvo (ex.: `Processo.zip`). */
  readonly nome: string;
  status: DownloadStatus;
  totalArquivos: number;
  arquivosProcessados: number;
  /** 0..1, ou `null` quando não dá pra calcular (ex.: sem tamanho total). */
  progresso: number | null;
}

/** Intervalo do polling do progresso da compactação, no servidor. */
export const POLL_MS = 900;

const ATIVA = (t: DownloadTask): boolean =>
  t.status === 'preparando' || t.status === 'compactando' || t.status === 'baixando';

/**
 * Bandeja de downloads no estilo Google Drive, com percentual real. O zip é montado no servidor
 * (job assíncrono): aqui se cria o job, faz-se polling do progresso da compactação e, quando fica
 * pronto, baixa-se o arquivo já completo (com `Content-Length`, então essa fase também tem %).
 * Nada disso trava a tela, e a bandeja sobrevive à navegação entre telas.
 */
@Injectable({ providedIn: 'root' })
export class DownloadsService {
  private readonly docs = inject(DocumentsService);

  private readonly _tarefas = signal<DownloadTask[]>([]);
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
      { id, nome, status: 'preparando', totalArquivos: 0, arquivosProcessados: 0, progresso: null },
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

  /** Aborta o download (polling ou transferência) e manda o servidor descartar o job. */
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

  private marcar(id: string, status: DownloadStatus): void {
    this.registro.delete(id);
    this.atualizar(id, { status });
  }

  private atualizar(id: string, patch: Partial<DownloadTask>): void {
    this._tarefas.update((tarefas) => tarefas.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  private novoId(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `dl-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
