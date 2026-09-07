import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { DownloadStatus, DownloadTask, DownloadsService } from './downloads.service';

/**
 * Bandeja fixa no canto inferior direito (estilo Google Drive): lista os downloads de zip em
 * andamento/encerrados sem travar o resto da tela. Renderizada uma vez pelo `layout`.
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
    return status === 'preparando' || status === 'baixando';
  }

  protected linhaStatus(t: DownloadTask): string {
    switch (t.status) {
      case 'preparando':
        return 'Preparando…';
      case 'baixando':
        return t.recebidoBytes > 0 ? `${this.formatarBytes(t.recebidoBytes)} recebidos` : 'Compactando…';
      case 'concluido':
        return `Concluído · ${this.formatarBytes(t.totalBytes ?? t.recebidoBytes)}`;
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

  private formatarBytes(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    const unidades = ['KB', 'MB', 'GB'];
    let valor = bytes / 1024;
    let i = 0;
    while (valor >= 1024 && i < unidades.length - 1) {
      valor /= 1024;
      i++;
    }
    return `${valor.toFixed(valor >= 10 || i === 0 ? 0 : 1)} ${unidades[i]}`;
  }
}
