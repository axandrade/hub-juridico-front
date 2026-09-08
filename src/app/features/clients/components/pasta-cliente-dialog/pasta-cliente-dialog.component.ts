import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';

import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import {
  DocumentExplorerComponent,
  DocumentExplorerNotice,
  DocumentExplorerNoticeKey,
} from '../../../documents/components/document-explorer/document-explorer.component';
import { ClientePastaResumo } from '../../services/cliente-pasta-resumo.model';
import { PastaClienteService } from '../../services/pasta-cliente.service';
import { ClientesComArquivosComponent } from '../clientes-com-arquivos/clientes-com-arquivos.component';

/**
 * Diálogo "Abrir pasta do cliente" — global, montado uma vez pelo `layout`, então acessível de
 * qualquer tela pelo botão do header. Com um cliente publicado no `PastaClienteService` (a tela
 * de clientes faz isso ao selecionar uma linha) abre direto no explorador dele; sem nenhum,
 * mostra a tabela de visão geral (clientes que já têm arquivos).
 */
@Component({
  selector: 'app-pasta-cliente-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, DocumentExplorerComponent, ClientesComArquivosComponent],
  templateUrl: './pasta-cliente-dialog.component.html',
  styleUrl: './pasta-cliente-dialog.component.scss',
})
export class PastaClienteDialogComponent {
  protected readonly pastaCliente = inject(PastaClienteService);

  /** Cliente aberto no explorador — desacoplado de `pastaCliente.cliente()` pra navegar pela
   * tabela de visão geral sem depender de nenhuma seleção externa. `null` = mostra a visão geral. */
  protected readonly pastaExplorerPessoa = signal<{ id: number; nome: string } | null>(null);
  protected readonly pastaResumoTick = signal(0);
  protected readonly pastaNotice = signal<string | null>(null);

  constructor() {
    // Ao abrir: com cliente publicado vai direto pro explorador; sem nenhum, visão geral.
    effect(() => {
      const aberto = this.pastaCliente.aberto();
      untracked(() => {
        if (!aberto) {
          this.pastaExplorerPessoa.set(null);
          this.pastaNotice.set(null);
          return;
        }
        const cliente = this.pastaCliente.cliente();
        if (cliente) {
          this.pastaExplorerPessoa.set({ id: cliente.id, nome: cliente.nome });
        } else {
          this.pastaExplorerPessoa.set(null);
          this.pastaResumoTick.update((tick) => tick + 1);
        }
      });
    });
  }

  protected fechar(): void {
    this.pastaCliente.fechar();
    this.pastaNotice.set(null);
  }

  /** Clique numa linha da tabela de visão geral: abre o explorador daquele cliente. */
  protected abrirPastaDoResumo(row: ClientePastaResumo): void {
    this.pastaNotice.set(null);
    this.pastaExplorerPessoa.set({ id: row.pessoaId, nome: row.nome });
  }

  /** Volta do explorador para a tabela de visão geral (e a recarrega). */
  protected voltarParaListaPastas(): void {
    this.pastaNotice.set(null);
    this.pastaExplorerPessoa.set(null);
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
