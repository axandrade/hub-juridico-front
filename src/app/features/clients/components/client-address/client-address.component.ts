import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormControl } from '@angular/forms';

import { EnderecoGroup } from '../../forms/client-form.factory';
import { ENDERECO_FIELDS } from '../../models/client-form.model';
import { ClientFieldComponent } from '../client-field/client-field.component';

/** Editor de endereço — compartilhado por cliente e representante legal. */
@Component({
  selector: 'app-client-address',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ClientFieldComponent],
  templateUrl: './client-address.component.html',
  styleUrl: './client-address.component.scss',
})
export class ClientAddressComponent {
  readonly group = input.required<EnderecoGroup>();

  protected readonly rows = ENDERECO_FIELDS;

  protected control(key: string): FormControl<string> {
    return this.group().get(key) as FormControl<string>;
  }
}
