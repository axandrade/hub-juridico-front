import { Directive, ElementRef, inject } from '@angular/core';
import { NgControl } from '@angular/forms';

import { maskDocumento } from '../../core/auth/cpf';

/**
 * Aplica a máscara combinada CPF/CNPJ enquanto o usuário digita (CPF até 11
 * dígitos, CNPJ a partir do 12º), mantendo o `FormControl` sincronizado.
 * Uso: `<input appDocumentoMask formControlName="documento" inputmode="numeric" />`.
 */
@Directive({
  selector: 'input[appDocumentoMask]',
  host: {
    '(input)': 'onInput()',
    inputmode: 'numeric',
    maxlength: '18',
  },
})
export class DocumentoMaskDirective {
  private readonly el = inject<ElementRef<HTMLInputElement>>(ElementRef);
  private readonly ngControl = inject(NgControl, { optional: true, self: true });

  protected onInput(): void {
    const input = this.el.nativeElement;
    const masked = maskDocumento(input.value);
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
