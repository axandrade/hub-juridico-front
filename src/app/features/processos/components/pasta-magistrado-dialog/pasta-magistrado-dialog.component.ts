import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { DOCUMENTS_PORT } from '../../../documents/services/documents-port';
import {
  DocumentExplorerComponent,
  DocumentExplorerNotice,
  DocumentExplorerNoticeKey,
} from '../../../documents/components/document-explorer/document-explorer.component';
import { MagistradoDocumentsService } from '../../../documents/services/magistrado-documents.service';
import { PastaMagistradoService } from '../../services/pasta-magistrado.service';

/**
 * Diálogo "Pasta do magistrado" — global, montado uma vez pelo `layout`. Versão simplificada de
 * `PastaClienteDialogComponent`: não existe "visão geral" aqui (o botão que abre isso, na linha
 * do magistrado da aba "Outros envolvidos", já sabe sempre qual magistrado) — só o explorador.
 */
@Component({
  selector: 'app-pasta-magistrado-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, DocumentExplorerComponent],
  // `DocumentExplorerComponent` (aninhado no template) resolve DOCUMENTS_PORT daqui — mesmo
  // explorador do cliente, só troca o backend (ver `documents-port.ts`).
  providers: [{ provide: DOCUMENTS_PORT, useExisting: MagistradoDocumentsService }],
  templateUrl: './pasta-magistrado-dialog.component.html',
  styleUrl: './pasta-magistrado-dialog.component.scss',
})
export class PastaMagistradoDialogComponent {
  protected readonly pastaMagistrado = inject(PastaMagistradoService);
  protected readonly pastaNotice = signal<string | null>(null);

  protected fechar(): void {
    this.pastaMagistrado.fechar();
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
