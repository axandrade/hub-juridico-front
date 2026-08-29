import {
  Directive,
  ElementRef,
  inject,
  input,
} from '@angular/core';

/**
 * Realça o elemento no hover com o rosa pálido da paleta (hover botânico).
 * Uso: `<div appHighlight>` ou `<div [appHighlight]="'#e8b4b8'">`.
 */
@Directive({
  selector: '[appHighlight]',
  host: {
    '(mouseenter)': 'onEnter()',
    '(mouseleave)': 'onLeave()',
  },
})
export class HighlightDirective {
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly appHighlight = input<string>('var(--color-pink-pale)');

  private previousColor = '';

  protected onEnter(): void {
    const style = this.el.nativeElement.style;
    this.previousColor = style.backgroundColor;
    style.transition = 'background-color 150ms ease-in-out';
    style.backgroundColor = this.appHighlight();
  }

  protected onLeave(): void {
    this.el.nativeElement.style.backgroundColor = this.previousColor;
  }
}
