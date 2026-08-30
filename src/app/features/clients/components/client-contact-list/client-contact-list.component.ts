import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormArray, ReactiveFormsModule } from '@angular/forms';

import { CONTACT_TYPES } from '../../../../core/models';
import { ContactGroup, createContactGroup } from '../../forms/client-form.factory';
import { CLIENT_OPTION_LABELS } from '../../models/client-form.model';

/**
 * Editor da lista de contatos (`FormArray<ContactGroup>`) — telefone/WhatsApp com
 * marcação de principal. Espelha `Person.contacts` do backend.
 */
@Component({
  selector: 'app-client-contact-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './client-contact-list.component.html',
  styleUrl: './client-contact-list.component.scss',
})
export class ClientContactListComponent {
  readonly array = input.required<FormArray<ContactGroup>>();

  protected readonly contactTypes = CONTACT_TYPES;

  protected typeLabel(type: string): string {
    return CLIENT_OPTION_LABELS[type] ?? type;
  }

  protected add(): void {
    this.array().push(createContactGroup({ primary: this.array().length === 0 }));
  }

  protected remove(index: number): void {
    const wasPrimary = this.array().at(index).controls.primary.value;
    this.array().removeAt(index);
    if (wasPrimary && this.array().length) {
      this.array().at(0).controls.primary.setValue(true);
    }
  }

  protected makePrimary(index: number): void {
    this.array().controls.forEach((group, i) => group.controls.primary.setValue(i === index));
  }
}
