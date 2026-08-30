import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';

import { PersonType } from '../../../../core/models';
import { ClientForm } from '../../forms/client-form.factory';
import { LEGAL_IDENTITY_FIELDS, NATURAL_IDENTITY_FIELDS } from '../../models/client-form.model';
import { ClientAddressComponent } from '../client-address/client-address.component';
import { ClientContactListComponent } from '../client-contact-list/client-contact-list.component';
import { ClientEmailListComponent } from '../client-email-list/client-email-list.component';
import { ClientFieldComponent } from '../client-field/client-field.component';
import { ClientRepresentativesComponent } from '../client-representatives/client-representatives.component';

/**
 * Aba de cadastro do cliente — única para pessoa física e jurídica. Só a lista de
 * campos de identidade troca com `personType`; endereço, e-mails e contatos são
 * compartilhados (espelham `com.hubjuridico.domain.Person`).
 */
@Component({
  selector: 'app-client-person-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ClientFieldComponent,
    ClientAddressComponent,
    ClientEmailListComponent,
    ClientContactListComponent,
    ClientRepresentativesComponent,
  ],
  templateUrl: './client-person-form.component.html',
  styleUrl: './client-person-form.component.scss',
})
export class ClientPersonFormComponent {
  readonly form = input.required<ClientForm>();
  readonly personType = input.required<PersonType>();

  protected readonly identityRows = computed(() =>
    this.personType() === 'LEGAL' ? LEGAL_IDENTITY_FIELDS : NATURAL_IDENTITY_FIELDS,
  );

  private readonly identityGroup = computed<FormGroup>(() =>
    this.personType() === 'LEGAL'
      ? this.form().controls.legalPerson
      : this.form().controls.naturalPerson,
  );

  protected control(key: string): FormControl<string> {
    return this.identityGroup().get(key) as FormControl<string>;
  }
}
