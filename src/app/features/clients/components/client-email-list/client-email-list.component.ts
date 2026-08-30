import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormArray, ReactiveFormsModule } from '@angular/forms';

import { EmailGroup, createEmailGroup } from '../../forms/client-form.factory';

/**
 * Editor da lista de e-mails (`FormArray<EmailGroup>`). Um item é marcado como
 * principal (estrela) — espelha `Pessoa.getEmailPrincipal()` do backend.
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
    this.array().push(createEmailGroup({ principal: this.array().length === 0 }));
  }

  protected remove(index: number): void {
    const wasPrimary = this.array().at(index).controls.principal.value;
    this.array().removeAt(index);
    if (wasPrimary && this.array().length) {
      this.array().at(0).controls.principal.setValue(true);
    }
  }

  /** Marca como principal e move para o topo da lista. */
  protected makePrimary(index: number): void {
    const array = this.array();
    if (index > 0) {
      const group = array.at(index);
      array.removeAt(index);
      array.insert(0, group);
    }
    array.controls.forEach((group, i) => group.controls.principal.setValue(i === 0));
  }
}
