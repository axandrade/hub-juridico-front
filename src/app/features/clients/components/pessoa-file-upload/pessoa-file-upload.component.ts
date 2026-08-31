import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { PessoaArquivo } from '../../services/pessoa-arquivo.model';
import { PessoaArquivoService } from '../../services/pessoa-arquivo.service';
import { TipoAnexoService } from '../../services/tipo-anexo.service';

/** Estado do bloco "Tipo do anexo": lista, adicionando, editando ou confirmando exclusão. */
type ModoTipo = 'idle' | 'add' | 'edit' | 'confirmDelete';

/**
 * Diálogo de envio de arquivo da aba "Lista de arquivos". Dono do formulário
 * (tipo do anexo + arquivo), chama `PessoaArquivoService.enviar` e devolve o
 * metadado salvo via `uploaded` (ou a mensagem de erro via `failed`).
 *
 * O bloco "Tipo do anexo" também permite adicionar / editar / excluir tipos
 * (catálogo `tipos_anexo`), inline. Editar não mexe em arquivos já salvos — o
 * tipo escolhido é gravado no nome do arquivo no momento do upload.
 */
@Component({
  selector: 'app-pessoa-file-upload',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, ButtonComponent],
  templateUrl: './pessoa-file-upload.component.html',
  styleUrl: './pessoa-file-upload.component.scss',
})
export class PessoaFileUploadComponent {
  private readonly arquivos = inject(PessoaArquivoService);
  private readonly tiposAnexo = inject(TipoAnexoService);

  readonly pessoaId = input.required<number>();
  readonly open = input<boolean>(false);

  readonly closed = output<void>();
  readonly uploaded = output<PessoaArquivo>();
  readonly failed = output<string>();

  /** Opções do dropdown "Tipo do anexo" — catálogo `tipos_anexo` do backend. */
  protected readonly tipos = this.tiposAnexo.tipos;
  private readonly tipoEscolhido = signal<number | null>(null);
  /** Id selecionado: o que o usuário escolheu, ou o primeiro da lista por padrão. */
  protected readonly tipoId = computed(() => this.tipoEscolhido() ?? this.tipos()[0]?.id ?? null);
  protected readonly nomeTipoSelecionado = computed(
    () => this.tipos().find((t) => t.id === this.tipoId())?.nome ?? '',
  );

  // --- gerenciamento inline do catálogo de tipos ---
  protected readonly modoTipo = signal<ModoTipo>('idle');
  protected readonly rascunhoTipo = signal('');
  protected readonly erroTipo = signal<string | null>(null);
  protected readonly salvandoTipo = signal(false);
  /** Menu "⋮" com as ações de tipo (adicionar / editar / excluir). */
  protected readonly menuTipoAberto = signal(false);

  protected readonly file = signal<File | null>(null);
  protected readonly sending = signal(false);
  protected readonly dragging = signal(false);

  constructor() {
    this.tiposAnexo.carregar();
  }

  protected pickFile(event: Event): void {
    this.file.set((event.target as HTMLInputElement).files?.[0] ?? null);
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const dropped = event.dataTransfer?.files?.[0];
    if (dropped) {
      this.file.set(dropped);
    }
  }

  protected setTipo(event: Event): void {
    this.tipoEscolhido.set(Number((event.target as HTMLSelectElement).value));
  }

  // --- ações do bloco de tipos ---

  protected toggleMenuTipo(): void {
    this.menuTipoAberto.update((v) => !v);
  }

  /**
   * Fecha o menu "⋮" ao clicar em qualquer lugar do diálogo fora dele. O modal para
   * a propagação do clique no card, então ouvimos no próprio conteúdo, não no document.
   */
  protected onClickNoDialogo(event: MouseEvent): void {
    if (this.menuTipoAberto() && !(event.target as HTMLElement)?.closest('.file-upload__tipo-menu')) {
      this.menuTipoAberto.set(false);
    }
  }

  protected iniciarAddTipo(): void {
    this.menuTipoAberto.set(false);
    this.rascunhoTipo.set('');
    this.erroTipo.set(null);
    this.modoTipo.set('add');
  }

  protected iniciarEditTipo(): void {
    this.menuTipoAberto.set(false);
    if (this.tipoId() === null) {
      return;
    }
    this.rascunhoTipo.set(this.nomeTipoSelecionado());
    this.erroTipo.set(null);
    this.modoTipo.set('edit');
  }

  protected iniciarDeleteTipo(): void {
    this.menuTipoAberto.set(false);
    if (this.tipoId() === null) {
      return;
    }
    this.erroTipo.set(null);
    this.modoTipo.set('confirmDelete');
  }

  protected cancelarTipo(): void {
    if (this.salvandoTipo()) {
      return;
    }
    this.modoTipo.set('idle');
    this.rascunhoTipo.set('');
    this.erroTipo.set(null);
  }

  protected atualizarRascunho(event: Event): void {
    this.rascunhoTipo.set((event.target as HTMLInputElement).value);
  }

  protected confirmarTipo(): void {
    const nome = this.rascunhoTipo().trim();
    const modo = this.modoTipo();
    if (!nome || this.salvandoTipo() || (modo !== 'add' && modo !== 'edit')) {
      return;
    }
    this.salvandoTipo.set(true);
    this.erroTipo.set(null);

    const req$ =
      modo === 'add'
        ? this.tiposAnexo.criar(nome)
        : this.tiposAnexo.alterar(this.tipoId() as number, nome);

    req$.subscribe({
      next: (tipo) => {
        this.salvandoTipo.set(false);
        if (modo === 'add') {
          this.tipoEscolhido.set(tipo.id);
        }
        this.modoTipo.set('idle');
        this.rascunhoTipo.set('');
      },
      error: (err: unknown) => {
        this.salvandoTipo.set(false);
        this.erroTipo.set(this.tipoErro(err));
      },
    });
  }

  protected confirmarDeleteTipo(): void {
    const id = this.tipoId();
    if (id === null || this.salvandoTipo()) {
      return;
    }
    this.salvandoTipo.set(true);
    this.erroTipo.set(null);
    this.tiposAnexo.excluir(id).subscribe({
      next: () => {
        this.salvandoTipo.set(false);
        this.tipoEscolhido.set(null);
        this.modoTipo.set('idle');
      },
      error: (err: unknown) => {
        this.salvandoTipo.set(false);
        this.erroTipo.set(this.tipoErro(err));
      },
    });
  }

  // --- envio do arquivo ---

  protected submit(): void {
    const file = this.file();
    const tipoId = this.tipoId();
    if (!file || tipoId === null || this.sending() || this.modoTipo() !== 'idle') {
      return;
    }
    this.sending.set(true);
    this.arquivos.enviar(this.pessoaId(), file, tipoId).subscribe({
      next: (arquivo) => {
        this.sending.set(false);
        this.reset();
        this.uploaded.emit(arquivo);
      },
      error: (err: unknown) => {
        this.sending.set(false);
        this.failed.emit(this.errorMessage(err));
      },
    });
  }

  protected close(): void {
    if (this.sending() || this.salvandoTipo()) {
      return;
    }
    this.reset();
    this.closed.emit();
  }

  private reset(): void {
    this.file.set(null);
    this.tipoEscolhido.set(null);
    this.dragging.set(false);
    this.modoTipo.set('idle');
    this.rascunhoTipo.set('');
    this.erroTipo.set(null);
    this.menuTipoAberto.set(false);
  }

  /** Erro de uma operação no catálogo de tipos (nome duplicado é o caso comum). */
  private tipoErro(err: unknown): string {
    if ((err as { status?: number })?.status === 409) {
      return 'Já existe um tipo com esse nome.';
    }
    return this.errorMessage(err);
  }

  /** Mensagem legível de um erro HTTP (ProblemDetail do backend). */
  private errorMessage(err: unknown): string {
    const e = err as {
      error?: { detail?: string; title?: string; message?: string };
      message?: string;
      status?: number;
    };
    if (e?.status === 0) {
      return 'Sem conexão com o servidor.';
    }
    return (
      e?.error?.detail ||
      e?.error?.title ||
      e?.error?.message ||
      e?.message ||
      'Não foi possível concluir a operação.'
    );
  }
}
