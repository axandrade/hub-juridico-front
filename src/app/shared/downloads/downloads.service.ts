import { HttpEvent, HttpEventType } from '@angular/common/http';
import { Injectable, computed, signal } from '@angular/core';
import { Observable, Subscription } from 'rxjs';

export type DownloadStatus = 'preparando' | 'baixando' | 'concluido' | 'erro' | 'cancelado';

export interface DownloadTask {
  readonly id: string;
  /** Nome do arquivo final salvo (ex.: `Processo.zip`). */
  readonly nome: string;
  status: DownloadStatus;
  /** Bytes recebidos até agora. */
  recebidoBytes: number;
  /** Tamanho total, quando o servidor manda `Content-Length` — `null` em resposta streamada (zip). */
  totalBytes: number | null;
}

const ATIVA = (t: DownloadTask): boolean => t.status === 'preparando' || t.status === 'baixando';

/**
 * Bandeja de downloads no estilo Google Drive: cada download de zip (pasta ou seleção) vira uma
 * tarefa acompanhável no canto da tela, sem travar o resto do sistema. O download já é assíncrono
 * (XHR via `HttpClient`); aqui só se centraliza o estado e o salvamento do arquivo.
 *
 * Sem barra de porcentagem para o zip: a resposta é streamada (sem `Content-Length`), então mostra
 * bytes recebidos + spinner — igual ao "Compactando…" do Drive.
 */
@Injectable({ providedIn: 'root' })
export class DownloadsService {
  private readonly _tarefas = signal<DownloadTask[]>([]);
  readonly tarefas = this._tarefas.asReadonly();
  readonly quantidadeAtivas = computed(() => this._tarefas().filter(ATIVA).length);

  /** Assinaturas vivas por tarefa — permitem abortar o XHR ao cancelar. */
  private readonly assinaturas = new Map<string, Subscription>();

  /**
   * Registra uma tarefa e consome o fluxo de eventos HTTP de um download em blob
   * (`observe: 'events'`, `reportProgress: true`). Ao concluir, salva o arquivo automaticamente.
   */
  acompanhar(nome: string, eventos$: Observable<HttpEvent<Blob>>): string {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `dl-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    this._tarefas.update((tarefas) => [
      { id, nome, status: 'preparando', recebidoBytes: 0, totalBytes: null },
      ...tarefas,
    ]);

    const assinatura = eventos$.subscribe({
      next: (evento) => {
        if (evento.type === HttpEventType.DownloadProgress) {
          this.atualizar(id, {
            status: 'baixando',
            recebidoBytes: evento.loaded,
            totalBytes: evento.total ?? null,
          });
        } else if (evento.type === HttpEventType.Response) {
          const blob = evento.body ?? new Blob();
          this.salvarBlob(blob, nome);
          this.atualizar(id, { status: 'concluido', recebidoBytes: blob.size, totalBytes: blob.size });
          this.assinaturas.delete(id);
        }
      },
      error: () => {
        this.atualizar(id, { status: 'erro' });
        this.assinaturas.delete(id);
      },
    });

    this.assinaturas.set(id, assinatura);
    return id;
  }

  /** Aborta o download (fecha o XHR) e marca a tarefa como cancelada. */
  cancelar(id: string): void {
    this.assinaturas.get(id)?.unsubscribe();
    this.assinaturas.delete(id);
    this.atualizar(id, { status: 'cancelado' });
  }

  /** Remove uma tarefa da lista (aborta antes, se ainda estiver ativa). */
  remover(id: string): void {
    this.assinaturas.get(id)?.unsubscribe();
    this.assinaturas.delete(id);
    this._tarefas.update((tarefas) => tarefas.filter((t) => t.id !== id));
  }

  /** Tira da lista tudo que já terminou (concluído / erro / cancelado). */
  limparEncerradas(): void {
    this._tarefas.update((tarefas) => tarefas.filter(ATIVA));
  }

  private atualizar(id: string, patch: Partial<DownloadTask>): void {
    this._tarefas.update((tarefas) =>
      tarefas.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    );
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
