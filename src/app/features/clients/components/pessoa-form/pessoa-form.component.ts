import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FormControl } from '@angular/forms';

import { TipoPessoa } from '../../../../core/models';
import { ClientForm } from '../../forms/client-form.factory';
import { PESSOA_FISICA_FIELDS, PESSOA_JURIDICA_FIELDS } from '../../models/client-form.model';
import { ClientAddressComponent } from '../client-address/client-address.component';
import { ClientContactListComponent } from '../client-contact-list/client-contact-list.component';
import { ClientEmailListComponent } from '../client-email-list/client-email-list.component';
import { ClientFieldComponent } from '../client-field/client-field.component';
import { ClientRepresentativesComponent } from '../client-representatives/client-representatives.component';

/**
 * Aba "Dados pessoais" — um único formulário (`form.controls.pessoa`) para pessoa
 * física e jurídica. Só a lista de campos de identidade troca com `tipoPessoa`;
 * endereço, e-mails e contatos são compartilhados (espelham a base
 * `com.hubjuridico.dominio.Pessoa`).
 */
@Component({
  selector: 'app-pessoa-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ClientFieldComponent,
    ClientAddressComponent,
    ClientEmailListComponent,
    ClientContactListComponent,
    ClientRepresentativesComponent,
  ],
  templateUrl: './pessoa-form.component.html',
  styleUrl: './pessoa-form.component.scss',
})
export class PessoaFormComponent {
  readonly form = input.required<ClientForm>();
  readonly tipoPessoa = input.required<TipoPessoa>();

  protected readonly identityRows = computed(() =>
    this.tipoPessoa() === 'JURIDICA' ? PESSOA_JURIDICA_FIELDS : PESSOA_FISICA_FIELDS,
  );

  protected control(key: string): FormControl<string> {
    return this.form().controls.pessoa.get(key) as FormControl<string>;
  }
}
