import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { FormControl } from '@angular/forms';

import { onlyDigits } from '../../../../core/auth/cpf';
import { CepService } from '../../../../shared/services/cep.service';
import { EnderecoGroup } from '../../forms/client-form.factory';
import { ENDERECO_FIELDS } from '../../models/client-form.model';
import { ClientFieldComponent } from '../client-field/client-field.component';

/**
 * Editor de endereço — compartilhado por cliente e representante legal. Ao sair do campo CEP
 * (perde o foco) com 8 dígitos preenchidos, busca no backend (`CepService` → ViaCEP) e preenche
 * logradouro/bairro/cidade/UF automaticamente; `numero`/`complemento` continuam sempre manuais (o
 * ViaCEP não devolve isso). Se a busca falhar (CEP inexistente, backend fora do ar), não faz
 * nada — o usuário preenche à mão, sem nenhum aviso de erro bloqueando o formulário.
 */
@Component({
  selector: 'app-client-address',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ClientFieldComponent],
  templateUrl: './client-address.component.html',
  styleUrl: './client-address.component.scss',
})
export class ClientAddressComponent {
  private readonly cepService = inject(CepService);

  readonly group = input.required<EnderecoGroup>();

  protected readonly rows = ENDERECO_FIELDS;

  protected control(key: string): FormControl<string> {
    return this.group().get(key) as FormControl<string>;
  }

  protected onFieldBlur(key: string): void {
    if (key !== 'cep') {
      return;
    }
    const cep = onlyDigits(this.control('cep').value);
    if (cep.length !== 8) {
      return;
    }
    const group = this.group();
    this.cepService.buscar(cep).subscribe((resultado) => {
      if (!resultado) {
        return;
      }
      group.patchValue({
        logradouro: resultado.logradouro ?? group.controls.logradouro.value,
        bairro: resultado.bairro ?? group.controls.bairro.value,
        cidade: resultado.cidade ?? group.controls.cidade.value,
        uf: resultado.uf ?? group.controls.uf.value,
      });
    });
  }
}
