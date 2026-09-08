import { Directive, ElementRef, inject } from '@angular/core';
import { NgControl } from '@angular/forms';

import { maskNumeroCnj } from '../../core/auth/documentos-br';

/**
 * Aplica a máscara do número CNJ `0000000-00.0000.0.00.0000` enquanto o usuário
 * digita, mantendo o `FormControl` sincronizado com o valor mascarado. Use só no
 * campo de número de processo judicial — os demais tipos usam input livre.
 * Uso: `<input appCnjMask formControlName="numeroCnj" inputmode="numeric" />`.
 */
@Directive({
  selector: 'input[appCnjMask]',
  host: {
    '(input)': 'onInput()',
    inputmode: 'numeric',
    maxlength: '25',
  },
})
export class CnjMaskDirective {
  private readonly el = inject<ElementRef<HTMLInputElement>>(ElementRef);
  private readonly ngControl = inject(NgControl, { optional: true, self: true });

  protected onInput(): void {
    const input = this.el.nativeElement;
    const masked = maskNumeroCnj(input.value);
    if (masked === input.value) {
      return;
    }
    input.value = masked;
    const control = this.ngControl?.control;
    if (control) {
      control.setValue(masked, { emitEvent: true, emitModelToViewChange: false });
    }
  }
}
