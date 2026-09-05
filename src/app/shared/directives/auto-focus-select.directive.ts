import { AfterViewInit, Directive, ElementRef, inject } from '@angular/core';

/**
 * Foca e seleciona todo o texto do input assim que ele entra no DOM — usado na edição inline
 * (nova pasta / renomear, estilo Windows Explorer): o campo já aparece com o texto selecionado,
 * pronto pra digitar por cima.
 */
@Directive({
  selector: 'input[appAutoFocusSelect]',
})
export class AutoFocusSelectDirective implements AfterViewInit {
  private readonly el = inject(ElementRef<HTMLInputElement>);

  ngAfterViewInit(): void {
    const input = this.el.nativeElement;
    queueMicrotask(() => {
      input.focus();
      input.select();
    });
  }
}
