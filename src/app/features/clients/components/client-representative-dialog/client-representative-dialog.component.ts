import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';

import { onlyDigits } from '../../../../core/auth/cpf';
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
 * Dialog de cadastro/edição de um representante (legal ou financeiro — mini-pessoa:
 * identidade + endereço + e-mails + contatos). `documento` aceita CPF ou CNPJ, sem
 * distinção de natureza no formulário.
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

  private readonly destroyRef = inject(DestroyRef);

  protected form: RepresentanteGroup = createRepresentanteGroup();

  /** Espelha `form.controls.documento` para o template reagir (esconde "Cargo" p/ CNPJ). */
  protected readonly documento = signal('');

  /** CNPJ (14 dígitos) identifica o representante como pessoa jurídica — cargo não se aplica. */
  protected readonly isJuridica = computed(() => onlyDigits(this.documento()).length > 11);

  protected readonly identityRows = computed(() =>
    this.isJuridica()
      ? REPRESENTANTE_FIELDS.filter((row) => !row.some((field) => field.key === 'cargo'))
      : REPRESENTANTE_FIELDS,
  );

  protected readonly title = computed(() =>
    this.value() ? 'Editar representante' : 'Novo representante',
  );

  /** `true` depois de um "Salvar" barrado por identidade em branco. */
  protected readonly showError = signal(false);

  ngOnInit(): void {
    const value = this.value();
    if (value) {
      this.form = createRepresentanteGroup(value);
    }
    this.documento.set(this.form.controls.documento.value);
    this.form.controls.documento.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        this.documento.set(value);
        if (onlyDigits(value).length > 11) {
          this.form.controls.cargo.setValue('');
        }
      });
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
