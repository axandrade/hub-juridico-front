import { Directive, ElementRef, inject } from '@angular/core';
import { NgControl } from '@angular/forms';

import { maskMoeda } from '../../core/auth/documentos-br';

/**
 * Máscara de moeda BRL "cents-based" (os dígitos digitados viram centavos): `18000` → `180,00`.
 * O `FormControl` fica com o texto mascarado; use `parseMoeda` no serviço pra enviar número.
 * Uso: `<input appMoedaMask formControlName="valorPedido" inputmode="numeric" />`.
 */
@Directive({
  selector: 'input[appMoedaMask]',
  host: {
    '(input)': 'onInput()',
    inputmode: 'numeric',
  },
})
export class MoedaMaskDirective {
  private readonly el = inject<ElementRef<HTMLInputElement>>(ElementRef);
  private readonly ngControl = inject(NgControl, { optional: true, self: true });

  protected onInput(): void {
    const input = this.el.nativeElement;
    const masked = maskMoeda(input.value);
    if (masked === input.value) {
      return;
    }
    input.value = masked;
    this.ngControl?.control?.setValue(masked, { emitEvent: true, emitModelToViewChange: false });
  }
}
