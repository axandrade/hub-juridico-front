import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';

/**
 * Modal genérico da paleta botânica. Overlay fixo com card centralizado; fecha
 * no ESC, no clique fora e no "x". O conteúdo entra por projeção; o rodapé de
 * ações usa o slot `[modalFooter]`. Trava o scroll do body enquanto aberto.
 */
@Component({
  selector: 'app-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './modal.component.html',
  styleUrl: './modal.component.scss',
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class ModalComponent {
  private readonly document = inject(DOCUMENT);

  readonly open = input<boolean>(false);
  readonly title = input<string>('');
  /** Permite fechar pelo ESC / clique fora. */
  readonly dismissable = input<boolean>(true);
  /** Card mais largo (ex.: preview de documento). */
  readonly wide = input<boolean>(false);
  /** Card grande: mais largo e ocupando a altura toda disponível (ex.: explorador de arquivos). */
  readonly large = input<boolean>(false);
  /** Sem padding no corpo e cabeçalho enxuto — pra conteúdo que ocupa a área toda (iframe, imagem). */
  readonly flush = input<boolean>(false);
  /** Mostra o botão maximizar/restaurar no cabeçalho (estilo janela). */
  readonly maximizable = input<boolean>(false);
  /** z-index acima do normal — pra ficar sobre janelas flutuantes / outros overlays. */
  readonly elevated = input<boolean>(false);

  readonly closed = output<void>();

  protected readonly maximized = signal(false);

  constructor() {
    effect((onCleanup) => {
      const body = this.document.body;
      if (this.open() && body) {
        body.style.overflow = 'hidden';
        onCleanup(() => {
          body.style.overflow = '';
        });
      }
    });
  }

  protected toggleMaximized(): void {
    this.maximized.update((v) => !v);
  }

  protected onEscape(): void {
    if (this.open() && this.dismissable()) {
      this.close();
    }
  }

  protected onBackdrop(): void {
    if (this.dismissable()) {
      this.close();
    }
  }

  protected close(): void {
    this.closed.emit();
  }
}
