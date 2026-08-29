import { Directive, ElementRef, inject } from '@angular/core';
import { NgControl } from '@angular/forms';

import { maskCpf } from '../../core/auth/cpf';

/**
 * Aplica a máscara `000.000.000-00` enquanto o usuário digita, mantendo o
 * `FormControl` sincronizado com o valor mascarado.
 * Uso: `<input appCpfMask formControlName="cpf" inputmode="numeric" />`.
 */
@Directive({
  selector: 'input[appCpfMask]',
  host: {
    '(input)': 'onInput()',
    inputmode: 'numeric',
    maxlength: '14',
    autocomplete: 'username',
  },
})
export class CpfMaskDirective {
  private readonly el = inject<ElementRef<HTMLInputElement>>(ElementRef);
  private readonly ngControl = inject(NgControl, { optional: true, self: true });

  protected onInput(): void {
    const input = this.el.nativeElement;
    const masked = maskCpf(input.value);
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
