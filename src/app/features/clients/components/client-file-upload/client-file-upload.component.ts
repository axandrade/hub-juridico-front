import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { ClientArquivo } from '../../services/client-arquivo.model';
import { ClientArquivoService } from '../../services/client-arquivo.service';
import { TipoAnexoService } from '../../services/tipo-anexo.service';

/** Estado do bloco "Tipo do anexo": lista, adicionando, editando ou confirmando exclusão. */
type ModoTipo = 'idle' | 'add' | 'edit' | 'confirmDelete';

/** Só PDF e DOCX são aceitos no upload (mesma regra do backend). */
const EXTENSOES_PERMITIDAS = ['.pdf', '.docx'] as const;
const ACCEPT_ARQUIVO = EXTENSOES_PERMITIDAS.join(',');

function extensaoPermitida(nome: string): boolean {
  return EXTENSOES_PERMITIDAS.some((ext) => nome.toLowerCase().endsWith(ext));
}

/**
 * Diálogo de envio de arquivo da aba "Lista de arquivos". Dono do formulário
 * (tipo do anexo + arquivo), chama `ClientArquivoService.enviar` e devolve o
 * metadado salvo via `uploaded` (ou a mensagem de erro via `failed`).
 *
 * O bloco "Tipo do anexo" também permite adicionar / editar / excluir tipos
 * (catálogo `tipos_anexo`), inline. Editar não mexe em arquivos já salvos — o
 * tipo escolhido é gravado no nome do arquivo no momento do upload.
 */
@Component({
  selector: 'app-client-file-upload',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, ButtonComponent],
  templateUrl: './client-file-upload.component.html',
  styleUrl: './client-file-upload.component.scss',
})
export class ClientFileUploadComponent {
  private readonly arquivos = inject(ClientArquivoService);
  private readonly tiposAnexo = inject(TipoAnexoService);

  readonly pessoaId = input.required<number>();
  readonly open = input<boolean>(false);

  readonly closed = output<void>();
  readonly uploaded = output<ClientArquivo>();
  readonly failed = output<string>();

  /** Opções do dropdown "Tipo do anexo" — catálogo `tipos_anexo` do backend. */
  protected readonly tipos = this.tiposAnexo.tipos;
  private readonly tipoEscolhido = signal<number | null>(null);
  /** Id selecionado: o que o usuário escolheu, ou o primeiro da lista por padrão. */
  protected readonly tipoId = computed(() => this.tipoEscolhido() ?? this.tipos()[0]?.id ?? null);
  protected readonly nomeTipoSelecionado = computed(
    () => this.tipos().find((t) => t.id === this.tipoId())?.nome ?? '',
  );

  // --- combobox com busca ---
  private readonly comboInput = viewChild<ElementRef<HTMLInputElement>>('comboInput');
  protected readonly comboAberto = signal(false);
  protected readonly comboFiltro = signal('');
  protected readonly tiposFiltrados = computed(() => {
    const q = this.normalizar(this.comboFiltro());
    const todos = this.tipos();
    return q ? todos.filter((t) => this.normalizar(t.nome).includes(q)) : todos;
  });

  // --- gerenciamento inline do catálogo de tipos ---
  protected readonly modoTipo = signal<ModoTipo>('idle');
  protected readonly rascunhoTipo = signal('');
  protected readonly erroTipo = signal<string | null>(null);
  protected readonly salvandoTipo = signal(false);
  /** Menu "⋮" com as ações de tipo (adicionar / editar / excluir). */
  protected readonly menuTipoAberto = signal(false);

  protected readonly file = signal<File | null>(null);
  protected readonly erroArquivo = signal<string | null>(null);
  protected readonly sending = signal(false);
  protected readonly dragging = signal(false);

  /** Extensões aceitas, para o atributo `accept` do input. */
  protected readonly acceptArquivo = ACCEPT_ARQUIVO;

  constructor() {
    this.tiposAnexo.carregar();
  }

  protected pickFile(event: Event): void {
    this.selecionarArquivo((event.target as HTMLInputElement).files?.[0] ?? null);
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
    this.selecionarArquivo(event.dataTransfer?.files?.[0] ?? null);
  }

  /** Aceita o arquivo só se for PDF/DOCX; senão registra o erro e não guarda. */
  private selecionarArquivo(arquivo: File | null): void {
    if (arquivo && !extensaoPermitida(arquivo.name)) {
      this.file.set(null);
      this.erroArquivo.set('Formato não permitido. Envie um PDF ou DOCX.');
      return;
    }
    this.erroArquivo.set(null);
    this.file.set(arquivo);
  }

  // --- combobox do tipo ---

  protected abrirCombo(): void {
    this.comboFiltro.set('');
    this.comboAberto.set(true);
    this.menuTipoAberto.set(false);
    // Zera o campo na hora (o [value] só troca no próximo CD).
    const el = this.comboInput()?.nativeElement;
    if (el) {
      el.value = '';
    }
  }

  protected filtrarCombo(event: Event): void {
    this.comboFiltro.set((event.target as HTMLInputElement).value);
    this.comboAberto.set(true);
  }

  protected escolherTipo(id: number): void {
    this.tipoEscolhido.set(id);
    this.fecharCombo();
  }

  protected fecharCombo(): void {
    this.comboAberto.set(false);
    this.comboFiltro.set('');
  }

  /** Esc na busca fecha só a lista (sem deixar o modal capturar e fechar tudo). */
  protected onComboEscape(event: Event): void {
    if (this.comboAberto()) {
      event.stopPropagation();
      this.fecharCombo();
    }
  }

  /** Enter no campo de busca seleciona a primeira opção filtrada. */
  protected selecionarPrimeiroTipo(): void {
    const primeiro = this.tiposFiltrados()[0];
    if (primeiro) {
      this.escolherTipo(primeiro.id);
    }
  }

  private normalizar(valor: string): string {
    return valor
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();
  }

  // --- ações do bloco de tipos ---

  protected toggleMenuTipo(): void {
    this.menuTipoAberto.update((v) => !v);
  }

  /**
   * Fecha o menu "⋮" e a lista do combo ao clicar em qualquer lugar do diálogo fora deles.
   * O modal para a propagação do clique no card, então ouvimos no conteúdo, não no document.
   */
  protected onClickNoDialogo(event: MouseEvent): void {
    const alvo = event.target as HTMLElement | null;
    if (this.menuTipoAberto() && !alvo?.closest('.file-upload__tipo-menu')) {
      this.menuTipoAberto.set(false);
    }
    if (this.comboAberto() && !alvo?.closest('.file-upload__combo')) {
      this.fecharCombo();
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
    this.erroArquivo.set(null);
    this.tipoEscolhido.set(null);
    this.dragging.set(false);
    this.modoTipo.set('idle');
    this.rascunhoTipo.set('');
    this.erroTipo.set(null);
    this.menuTipoAberto.set(false);
    this.fecharCombo();
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
