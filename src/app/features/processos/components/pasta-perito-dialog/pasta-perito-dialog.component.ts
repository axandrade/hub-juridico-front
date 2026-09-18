import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';

import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { DOCUMENTS_PORT } from '../../../documents/services/documents-port';
import {
  DocumentExplorerComponent,
  DocumentExplorerNotice,
  DocumentExplorerNoticeKey,
} from '../../../documents/components/document-explorer/document-explorer.component';
import { PeritoDocumentsService } from '../../../documents/services/perito-documents.service';
import { PastaPeritoService } from '../../services/pasta-perito.service';
import { ProcessoPastaResumo } from '../../services/processo-pasta-resumo.model';
import { ProcessosPeritoComArquivosComponent } from '../processos-perito-com-arquivos/processos-perito-com-arquivos.component';

/**
 * Diálogo "Pasta do perito" — global, montado uma vez pelo `layout`. Cópia fiel de
 * `PastaMagistradoDialogComponent` (mesmo comportamento, por decisão do usuário): a "visão geral"
 * aqui é por processo, não por perito (o botão que abre isso, na linha do perito da aba "Outros
 * envolvidos", já sabe sempre qual perito) — mostra todos os processos em que ele está atrelado;
 * clicar num abre o explorador já navegado na subpasta daquele processo (criada automaticamente,
 * ver `ProcessoService`).
 */
@Component({
  selector: 'app-pasta-perito-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, DocumentExplorerComponent, ProcessosPeritoComArquivosComponent],
  // `DocumentExplorerComponent` (aninhado no template) resolve DOCUMENTS_PORT daqui — mesmo
  // explorador do cliente/magistrado, só troca o backend (ver `documents-port.ts`).
  providers: [{ provide: DOCUMENTS_PORT, useExisting: PeritoDocumentsService }],
  templateUrl: './pasta-perito-dialog.component.html',
  styleUrl: './pasta-perito-dialog.component.scss',
})
export class PastaPeritoDialogComponent {
  protected readonly pastaPerito = inject(PastaPeritoService);

  /** Processo aberto no explorador — `null` = mostra a visão geral (tabela de processos). */
  protected readonly pastaExplorerProcesso = signal<ProcessoPastaResumo | null>(null);
  protected readonly pastaResumoTick = signal(0);
  protected readonly pastaNotice = signal<string | null>(null);

  constructor() {
    // Toda vez que o diálogo abre (mesmo pro mesmo perito de antes), volta pra visão geral.
    effect(() => {
      const aberto = this.pastaPerito.aberto();
      untracked(() => {
        if (!aberto) {
          this.pastaExplorerProcesso.set(null);
          this.pastaNotice.set(null);
          return;
        }
        this.pastaExplorerProcesso.set(null);
        this.pastaResumoTick.update((tick) => tick + 1);
      });
    });
  }

  protected fechar(): void {
    this.pastaPerito.fechar();
    this.pastaNotice.set(null);
  }

  /** Clique numa linha da tabela de visão geral: abre o explorador naquele processo. */
  protected abrirPastaDoResumo(row: ProcessoPastaResumo): void {
    this.pastaNotice.set(null);
    this.pastaExplorerProcesso.set(row);
  }

  /** Volta do explorador para a tabela de visão geral (e a recarrega). */
  protected voltarParaListaPastas(): void {
    this.pastaNotice.set(null);
    this.pastaExplorerProcesso.set(null);
    this.pastaResumoTick.update((tick) => tick + 1);
  }

  protected onPastaNotice(evento: DocumentExplorerNotice): void {
    const alvo = evento.subject ?? '';
    const textos: Record<DocumentExplorerNoticeKey, string> = {
      pastaCriada: `Pasta criada: ${alvo}`,
      pastaCriadaErro: `Não foi possível criar a pasta: ${alvo}`,
      renomeado: `Renomeado: ${alvo}`,
      renomeadoErro: `Não foi possível renomear: ${alvo}`,
      movidoErro: `Não foi possível mover: ${alvo}`,
      excluido: `Excluído: ${alvo}`,
      excluidoErro: `Não foi possível excluir: ${alvo}`,
      pastaNaoVazia: `A pasta "${alvo}" não está vazia.`,
      uploadErro: `Não foi possível enviar: ${alvo}`,
      downloadErro: `Não foi possível baixar: ${alvo}`,
      editarIndisponivel: `Edição online não disponível para: ${alvo}`,
      editarErro: `Não foi possível abrir para edição: ${alvo}`,
      convertidoOk: `Convertido para PDF: ${alvo}`,
      convertidoErro: `Não foi possível converter: ${alvo}`,
      tipoErro: `Não foi possível salvar o tipo do anexo: ${alvo}`,
    };
    this.pastaNotice.set(textos[evento.key]);
  }
}
