import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormArray, FormControl } from '@angular/forms';

import { RepresentativeGroup, createRepresentativeGroup } from '../../forms/client-form.factory';
import { REPRESENTATIVE_IDENTITY_FIELDS } from '../../models/client-form.model';
import { ClientAddressComponent } from '../client-address/client-address.component';
import { ClientContactListComponent } from '../client-contact-list/client-contact-list.component';
import { ClientEmailListComponent } from '../client-email-list/client-email-list.component';
import { ClientFieldComponent } from '../client-field/client-field.component';

/**
 * Editor dos representantes legais (`FormArray<RepresentativeGroup>`). Cada item é
 * um mini-cadastro de pessoa (identidade + endereço + e-mails + contatos),
 * espelhando `com.hubjuridico.domain.LegalRepresentative`.
 */
@Component({
  selector: 'app-client-representatives',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ClientFieldComponent,
    ClientAddressComponent,
    ClientEmailListComponent,
    ClientContactListComponent,
  ],
  templateUrl: './client-representatives.component.html',
  styleUrl: './client-representatives.component.scss',
})
export class ClientRepresentativesComponent {
  readonly array = input.required<FormArray<RepresentativeGroup>>();

  protected readonly identityRows = REPRESENTATIVE_IDENTITY_FIELDS;

  protected control(group: RepresentativeGroup, key: string): FormControl<string> {
    return group.get(key) as FormControl<string>;
  }

  protected add(): void {
    this.array().push(createRepresentativeGroup());
  }

  protected remove(index: number): void {
    this.array().removeAt(index);
  }
}
