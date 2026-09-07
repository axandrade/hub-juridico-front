import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { DownloadStatus, DownloadTask, DownloadsService } from './downloads.service';

/**
 * Bandeja fixa no canto inferior direito (estilo Google Drive): lista os downloads de zip em
 * andamento/encerrados, com percentual, sem travar o resto da tela. Renderizada uma vez pelo
 * `layout`.
 */
@Component({
  selector: 'app-downloads-tray',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './downloads-tray.component.html',
  styleUrl: './downloads-tray.component.scss',
})
export class DownloadsTrayComponent {
  private readonly downloads = inject(DownloadsService);

  protected readonly tarefas = this.downloads.tarefas;
  protected readonly quantidadeAtivas = this.downloads.quantidadeAtivas;
  protected readonly recolhida = signal(false);

  protected alternarRecolhida(): void {
    this.recolhida.update((v) => !v);
  }

  protected cancelar(id: string): void {
    this.downloads.cancelar(id);
  }

  protected remover(id: string): void {
    this.downloads.remover(id);
  }

  protected limpar(): void {
    this.downloads.limparEncerradas();
  }

  protected ativa(status: DownloadStatus): boolean {
    return status === 'preparando' || status === 'compactando' || status === 'baixando';
  }

  /** 0..100, ou `null` quando não há como calcular (mostra spinner sem barra). */
  protected porcentagem(t: DownloadTask): number | null {
    return t.progresso == null ? null : Math.round(t.progresso * 100);
  }

  protected linhaStatus(t: DownloadTask): string {
    const pct = this.porcentagem(t);
    switch (t.status) {
      case 'preparando':
        return 'Preparando…';
      case 'compactando': {
        const arquivos =
          t.totalArquivos > 0 ? `Compactando ${t.arquivosProcessados}/${t.totalArquivos}` : 'Compactando…';
        return pct == null ? arquivos : `${arquivos} · ${pct}%`;
      }
      case 'baixando':
        return pct == null ? 'Baixando…' : `Baixando… ${pct}%`;
      case 'concluido':
        return 'Concluído';
      case 'cancelado':
        return 'Cancelado';
      case 'erro':
        return 'Falhou — tente de novo';
    }
  }

  protected icone(status: DownloadStatus): string {
    switch (status) {
      case 'concluido':
        return 'fa-solid fa-circle-check';
      case 'erro':
        return 'fa-solid fa-circle-exclamation';
      case 'cancelado':
        return 'fa-solid fa-ban';
      default:
        return 'fa-solid fa-file-zipper';
    }
  }
}
