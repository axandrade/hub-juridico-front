import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormArray, ReactiveFormsModule } from '@angular/forms';

import { TIPOS_CONTATO } from '../../../../core/models';
import { ContatoGroup, createContatoGroup } from '../../forms/client-form.factory';
import { CLIENT_OPTION_LABELS } from '../../models/client-form.model';

/**
 * Editor da lista de contatos (`FormArray<ContatoGroup>`) — telefone/WhatsApp com
 * marcação de principal. Espelha `Pessoa.contatos` do backend.
 */
@Component({
  selector: 'app-client-contact-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './client-contact-list.component.html',
  styleUrl: './client-contact-list.component.scss',
})
export class ClientContactListComponent {
  readonly array = input.required<FormArray<ContatoGroup>>();

  protected readonly contactTypes = TIPOS_CONTATO;

  protected typeLabel(type: string): string {
    return CLIENT_OPTION_LABELS[type] ?? type;
  }

  protected add(): void {
    this.array().push(createContatoGroup({ principal: this.array().length === 0 }));
  }

  protected remove(index: number): void {
    const wasPrimary = this.array().at(index).controls.principal.value;
    this.array().removeAt(index);
    if (wasPrimary && this.array().length) {
      this.array().at(0).controls.principal.setValue(true);
    }
  }

  protected makePrimary(index: number): void {
    this.array().controls.forEach((group, i) => group.controls.principal.setValue(i === index));
  }
}
