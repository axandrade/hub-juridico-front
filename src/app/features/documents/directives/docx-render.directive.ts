import { Directive, ElementRef, effect, inject, input, output } from '@angular/core';

/**
 * Renderiza um `.docx` (Blob) dentro do próprio elemento host, via `docx-preview` (carregado sob
 * demanda). Uma instância por janela de preview — ver `document-explorer.component`.
 */
@Directive({
  selector: '[appDocxRender]',
})
export class DocxRenderDirective {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly blob = input.required<Blob | null>({ alias: 'appDocxRender' });
  readonly renderizado = output<void>();
  readonly falhou = output<void>();

  constructor() {
    effect(() => {
      const blob = this.blob();
      const el = this.host.nativeElement;
      el.replaceChildren();
      if (blob) {
        void this.renderizar(el, blob);
      }
    });
  }

  private async renderizar(el: HTMLElement, blob: Blob): Promise<void> {
    try {
      const { renderAsync } = await import('docx-preview');
      // `blob` pode ter mudado enquanto o import resolvia — só emite se ainda for este.
      if (this.blob() !== blob) {
        return;
      }
      await renderAsync(blob, el, undefined, { ignoreLastRenderedPageBreak: true });
      this.renderizado.emit();
    } catch {
      this.falhou.emit();
    }
  }
}
