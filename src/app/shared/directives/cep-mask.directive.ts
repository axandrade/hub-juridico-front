import { Directive, ElementRef, inject } from '@angular/core';
import { NgControl } from '@angular/forms';

import { maskCep } from '../../core/auth/cpf';

/**
 * Aplica a máscara `00000-000` enquanto o usuário digita, mantendo o
 * `FormControl` sincronizado com o valor mascarado.
 * Uso: `<input appCepMask formControlName="cep" inputmode="numeric" />`.
 */
@Directive({
  selector: 'input[appCepMask]',
  host: {
    '(input)': 'onInput()',
    inputmode: 'numeric',
    maxlength: '9',
  },
})
export class CepMaskDirective {
  private readonly el = inject<ElementRef<HTMLInputElement>>(ElementRef);
  private readonly ngControl = inject(NgControl, { optional: true, self: true });

  protected onInput(): void {
    const input = this.el.nativeElement;
    const masked = maskCep(input.value);
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
