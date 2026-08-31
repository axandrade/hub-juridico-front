import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input, output } from '@angular/core';

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

  readonly closed = output<void>();

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
