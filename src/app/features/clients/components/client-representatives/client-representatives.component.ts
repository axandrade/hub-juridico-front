import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormArray, FormControl } from '@angular/forms';

import { RepresentanteGroup, createRepresentanteGroup } from '../../forms/client-form.factory';
import { REPRESENTANTE_FIELDS } from '../../models/client-form.model';
import { ClientAddressComponent } from '../client-address/client-address.component';
import { ClientContactListComponent } from '../client-contact-list/client-contact-list.component';
import { ClientEmailListComponent } from '../client-email-list/client-email-list.component';
import { ClientFieldComponent } from '../client-field/client-field.component';

/**
 * Editor dos representantes legais (`FormArray<RepresentanteGroup>`). Cada item é
 * um mini-cadastro de pessoa (identidade + endereço + e-mails + contatos),
 * espelhando `com.hubjuridico.dominio.RepresentanteLegal`.
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
  readonly array = input.required<FormArray<RepresentanteGroup>>();

  protected readonly identityRows = REPRESENTANTE_FIELDS;

  protected control(group: RepresentanteGroup, key: string): FormControl<string> {
    return group.get(key) as FormControl<string>;
  }

  protected add(): void {
    this.array().push(createRepresentanteGroup());
  }

  protected remove(index: number): void {
    this.array().removeAt(index);
  }
}
