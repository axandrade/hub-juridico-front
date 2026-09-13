import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { DOCUMENTS_PORT } from '../../../documents/services/documents-port';
import {
  DocumentExplorerComponent,
  DocumentExplorerNotice,
  DocumentExplorerNoticeKey,
} from '../../../documents/components/document-explorer/document-explorer.component';
import { PeritoDocumentsService } from '../../../documents/services/perito-documents.service';
import { PastaPeritoService } from '../../services/pasta-perito.service';

/**
 * Diálogo "Pasta do perito" — global, montado uma vez pelo `layout`. Cópia fiel de
 * `PastaMagistradoDialogComponent` (mesmo comportamento): não existe "visão geral" aqui (o botão
 * que abre isso, na linha do perito da aba "Outros envolvidos", já sabe sempre qual perito) — só
 * o explorador.
 */
@Component({
  selector: 'app-pasta-perito-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, DocumentExplorerComponent],
  // `DocumentExplorerComponent` (aninhado no template) resolve DOCUMENTS_PORT daqui — mesmo
  // explorador do cliente/magistrado, só troca o backend (ver `documents-port.ts`).
  providers: [{ provide: DOCUMENTS_PORT, useExisting: PeritoDocumentsService }],
  templateUrl: './pasta-perito-dialog.component.html',
  styleUrl: './pasta-perito-dialog.component.scss',
})
export class PastaPeritoDialogComponent {
  protected readonly pastaPerito = inject(PastaPeritoService);
  protected readonly pastaNotice = signal<string | null>(null);

  protected fechar(): void {
    this.pastaPerito.fechar();
    this.pastaNotice.set(null);
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
