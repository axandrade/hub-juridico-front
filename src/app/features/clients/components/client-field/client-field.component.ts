import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { CepMaskDirective } from '../../../../shared/directives/cep-mask.directive';
import { CpfMaskDirective } from '../../../../shared/directives/cpf-mask.directive';
import {
  CLIENT_FIELD_LABELS,
  CLIENT_OPTION_LABELS,
  ClientFieldConfig,
  ClientInputKind,
} from '../../models/client-form.model';

/**
 * Campo rotulado do formulário de cliente. Renderiza input/select/textarea a
 * partir de um `ClientFieldConfig` e liga direto num `FormControl<string>`.
 */
@Component({
  selector: 'app-client-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, CpfMaskDirective, CepMaskDirective],
  template: `
    <label class="clients-field" [class.clients-field--full]="config().span === 'full'">
      <span>{{ label() }}</span>

      @switch (kind()) {
        @case ('select') {
          <select [formControl]="control()" (blur)="blurred.emit(config().key)">
            <option value="">Selecione</option>
            @for (option of config().options ?? []; track option) {
              <option [value]="option">{{ optionLabel(option) }}</option>
            }
          </select>
        }
        @case ('textarea') {
          <textarea [formControl]="control()" [rows]="config().rows ?? 3" (blur)="blurred.emit(config().key)"></textarea>
        }
        @case ('readonly') {
          <input
            type="text"
            [formControl]="control()"
            readonly
            placeholder="Será preenchido ao salvar"
          />
        }
        @case ('cpf') {
          <input type="text" appCpfMask [formControl]="control()" (blur)="blurred.emit(config().key)" />
        }
        @case ('cep') {
          <input type="text" appCepMask [formControl]="control()" (blur)="blurred.emit(config().key)" />
        }
        @default {
          <input [type]="kind()" [formControl]="control()" (blur)="blurred.emit(config().key)" />
        }
      }
    </label>
  `,
  styleUrl: './client-field.component.scss',
})
export class ClientFieldComponent {
  readonly config = input.required<ClientFieldConfig>();
  readonly control = input.required<FormControl<string>>();
  /** Emite a `key` do campo quando ele perde o foco. */
  readonly blurred = output<string>();

  protected readonly label = computed(
    () => CLIENT_FIELD_LABELS[this.config().key] ?? this.config().key,
  );
  protected readonly kind = computed<ClientInputKind | 'cpf' | 'cep'>(() => {
    if (this.config().mask === 'cpf') return 'cpf';
    if (this.config().mask === 'cep') return 'cep';
    return this.config().type ?? 'text';
  });

  protected optionLabel(option: string): string {
    return CLIENT_OPTION_LABELS[option] ?? option;
  }
}
