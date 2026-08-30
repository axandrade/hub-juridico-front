import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormArray, ReactiveFormsModule } from '@angular/forms';

import { EmailGroup, createEmailGroup } from '../../forms/client-form.factory';

/**
 * Editor da lista de e-mails (`FormArray<EmailGroup>`). Um item é marcado como
 * principal (estrela) — espelha `Person.getPrimaryEmail()` do backend.
 */
@Component({
  selector: 'app-client-email-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './client-email-list.component.html',
  styleUrl: './client-email-list.component.scss',
})
export class ClientEmailListComponent {
  readonly array = input.required<FormArray<EmailGroup>>();

  protected add(): void {
    this.array().push(createEmailGroup({ primary: this.array().length === 0 }));
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
