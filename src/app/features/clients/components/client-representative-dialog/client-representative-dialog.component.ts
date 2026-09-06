import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { FormControl } from '@angular/forms';

import { IRepresentanteLegal } from '../../../../core/models';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { RepresentanteGroup, createRepresentanteGroup } from '../../forms/client-form.factory';
import { REPRESENTANTE_FIELDS } from '../../models/client-form.model';
import { ClientAddressComponent } from '../client-address/client-address.component';
import { ClientContactListComponent } from '../client-contact-list/client-contact-list.component';
import { ClientEmailListComponent } from '../client-email-list/client-email-list.component';
import { ClientFieldComponent } from '../client-field/client-field.component';

/**
 * Dialog de cadastro/edição de um representante legal (mini-pessoa: identidade +
 * endereço + e-mails + contatos). Trabalha sobre uma cópia destacada — só devolve
 * o valor ao `client-representatives` quando o usuário confirma em "Salvar";
 * fechar/cancelar descarta tudo.
 */
@Component({
  selector: 'app-client-representative-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ModalComponent,
    ButtonComponent,
    ClientFieldComponent,
    ClientAddressComponent,
    ClientEmailListComponent,
    ClientContactListComponent,
  ],
  templateUrl: './client-representative-dialog.component.html',
  styleUrl: './client-representative-dialog.component.scss',
})
export class ClientRepresentativeDialogComponent implements OnInit {
  /** Representante a editar; ausente = cadastro novo. */
  readonly value = input<IRepresentanteLegal | null>(null);

  readonly saved = output<IRepresentanteLegal>();
  readonly closed = output<void>();

  protected readonly identityRows = REPRESENTANTE_FIELDS;
  protected form: RepresentanteGroup = createRepresentanteGroup();

  /** `true` depois de um "Salvar" barrado por nome/CPF em branco. */
  protected readonly showError = signal(false);

  protected readonly title = computed(() =>
    this.value() ? 'Editar representante legal' : 'Novo representante legal',
  );

  ngOnInit(): void {
    const value = this.value();
    if (value) {
      this.form = createRepresentanteGroup(value);
    }
  }

  protected control(key: string): FormControl<string> {
    return this.form.get(key) as FormControl<string>;
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.showError.set(true);
      return;
    }
    this.saved.emit(this.form.getRawValue());
  }

  protected cancel(): void {
    this.closed.emit();
  }
}
