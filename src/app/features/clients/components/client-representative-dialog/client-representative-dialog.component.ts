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

import { IRepresentanteLegal, TipoPessoa } from '../../../../core/models';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import {
  RepresentanteGroup,
  createRepresentanteGroup,
  setTipoRepresentante,
} from '../../forms/client-form.factory';
import {
  REPRESENTANTE_FISICA_FIELDS,
  REPRESENTANTE_JURIDICA_FIELDS,
} from '../../models/client-form.model';
import { ClientAddressComponent } from '../client-address/client-address.component';
import { ClientContactListComponent } from '../client-contact-list/client-contact-list.component';
import { ClientEmailListComponent } from '../client-email-list/client-email-list.component';
import { ClientFieldComponent } from '../client-field/client-field.component';

/**
 * Dialog de cadastro/edição de um representante legal (mini-pessoa: identidade +
 * endereço + e-mails + contatos). O representante pode ser física ou jurídica —
 * a natureza alterna nome/CPF ↔ razão social/CNPJ, como o painel da pessoa.
 *
 * Trabalha sobre uma cópia destacada: só devolve o valor (`saved`) quando o
 * usuário confirma em "Salvar"; fechar/cancelar descarta tudo.
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

  protected form: RepresentanteGroup = createRepresentanteGroup();

  /** Espelha `form.controls.tipo` para o template reagir (troca dos campos). */
  protected readonly tipo = signal<TipoPessoa>('FISICA');

  protected readonly identityRows = computed(() =>
    this.tipo() === 'JURIDICA' ? REPRESENTANTE_JURIDICA_FIELDS : REPRESENTANTE_FISICA_FIELDS,
  );

  protected readonly title = computed(() =>
    this.value() ? 'Editar representante legal' : 'Novo representante legal',
  );

  /** `true` depois de um "Salvar" barrado por identidade em branco. */
  protected readonly showError = signal(false);

  ngOnInit(): void {
    const value = this.value();
    if (value) {
      this.form = createRepresentanteGroup(value);
      this.tipo.set(this.form.controls.tipo.value);
    }
  }

  protected control(key: string): FormControl<string> {
    return this.form.get(key) as FormControl<string>;
  }

  protected setTipo(tipo: TipoPessoa): void {
    if (this.tipo() === tipo) {
      return;
    }
    setTipoRepresentante(this.form, tipo);
    this.tipo.set(tipo);
    this.showError.set(false);
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
