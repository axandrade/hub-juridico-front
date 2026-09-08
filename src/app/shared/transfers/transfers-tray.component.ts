import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { TransferStatus, TransferTask, TransfersService } from './transfers.service';

/**
 * Bandeja fixa no canto inferior direito (estilo Google Drive): lista as transferências —
 * downloads de zip e uploads de arquivo — em andamento/encerradas, com percentual, sem travar o
 * resto da tela. Renderizada uma vez pelo `layout`.
 */
@Component({
  selector: 'app-transfers-tray',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './transfers-tray.component.html',
  styleUrl: './transfers-tray.component.scss',
})
export class TransfersTrayComponent {
  private readonly transfers = inject(TransfersService);

  protected readonly tarefas = this.transfers.tarefas;
  protected readonly quantidadeAtivas = this.transfers.quantidadeAtivas;
  protected readonly recolhida = signal(false);

  protected alternarRecolhida(): void {
    this.recolhida.update((v) => !v);
  }

  protected cancelar(id: string): void {
    this.transfers.cancelar(id);
  }

  protected remover(id: string): void {
    this.transfers.remover(id);
  }

  protected limpar(): void {
    this.transfers.limparEncerradas();
  }

  protected ativa(status: TransferStatus): boolean {
    return (
      status === 'preparando' ||
      status === 'compactando' ||
      status === 'baixando' ||
      status === 'enviando'
    );
  }

  /** 0..100, ou `null` quando não há como calcular (mostra spinner sem barra). */
  protected porcentagem(t: TransferTask): number | null {
    return t.progresso == null ? null : Math.round(t.progresso * 100);
  }

  protected linhaStatus(t: TransferTask): string {
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
      case 'enviando':
        return pct == null ? 'Enviando…' : `Enviando… ${pct}%`;
      case 'concluido':
        return 'Concluído';
      case 'cancelado':
        return 'Cancelado';
      case 'erro':
        return 'Falhou — tente de novo';
    }
  }

  protected icone(t: TransferTask): string {
    switch (t.status) {
      case 'concluido':
        return 'fa-solid fa-circle-check';
      case 'erro':
        return 'fa-solid fa-circle-exclamation';
      case 'cancelado':
        return 'fa-solid fa-ban';
      default:
        return t.tipo === 'upload' ? 'fa-solid fa-file-arrow-up' : 'fa-solid fa-file-zipper';
    }
  }
}
