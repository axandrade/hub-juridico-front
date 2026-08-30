import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormControl } from '@angular/forms';

import { DossierGroup } from '../../forms/client-form.factory';
import { DOSSIER_FIELDS } from '../../models/client-form.model';
import { ClientFieldComponent } from '../client-field/client-field.component';

/** Aba "Administrativo" — o dossiê do escritório (`form.controls.dossier`). */
@Component({
  selector: 'app-client-admin-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ClientFieldComponent],
  templateUrl: './client-admin-form.component.html',
  styleUrl: './client-admin-form.component.scss',
})
export class ClientAdminFormComponent {
  readonly group = input.required<DossierGroup>();

  protected readonly rows = DOSSIER_FIELDS;

  protected control(key: string): FormControl<string> {
    return this.group().get(key) as FormControl<string>;
  }
}
