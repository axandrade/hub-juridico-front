import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { PessoaArquivo } from '../../services/pessoa-arquivo.model';
import { PessoaArquivoService } from '../../services/pessoa-arquivo.service';
import { TipoAnexo, TipoAnexoService } from '../../services/tipo-anexo.service';

/**
 * Diálogo de envio de arquivo da aba "Lista de arquivos". Dono do formulário
 * (tipo do anexo + arquivo), chama `PessoaArquivoService.enviar` e devolve o
 * metadado salvo via `uploaded` (ou a mensagem de erro via `failed`).
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
  protected readonly tipos = toSignal(this.tiposAnexo.listar(), { initialValue: [] as TipoAnexo[] });
  private readonly tipoEscolhido = signal<number | null>(null);
  /** Id selecionado: o que o usuário escolheu, ou o primeiro da lista por padrão. */
  protected readonly tipoId = computed(() => this.tipoEscolhido() ?? this.tipos()[0]?.id ?? null);

  protected readonly file = signal<File | null>(null);
  protected readonly sending = signal(false);
  protected readonly dragging = signal(false);

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

  protected submit(): void {
    const file = this.file();
    const tipoId = this.tipoId();
    if (!file || tipoId === null || this.sending()) {
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
    if (this.sending()) {
      return;
    }
    this.reset();
    this.closed.emit();
  }

  private reset(): void {
    this.file.set(null);
    this.tipoEscolhido.set(null);
    this.dragging.set(false);
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
      'Não foi possível enviar o arquivo.'
    );
  }
}
