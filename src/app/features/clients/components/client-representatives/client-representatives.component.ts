import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { FormArray } from '@angular/forms';

import { IRepresentanteLegal } from '../../../../core/models';
import { RepresentanteGroup, createRepresentanteGroup } from '../../forms/client-form.factory';
import { ClientRepresentativeDialogComponent } from '../client-representative-dialog/client-representative-dialog.component';

/** Item em edição no dialog: `index < 0` = cadastro novo. */
interface EditingRepresentante {
  index: number;
  value: IRepresentanteLegal | null;
}

/**
 * Lista enxuta de representantes (`FormArray<RepresentanteGroup>`) — reusada tanto
 * pra representantes legais (PJ) quanto financeiros (PF), só muda o `titulo`. Mostra
 * só nome / documento / cargo de cada um; adicionar e editar acontecem no dialog
 * (`ClientRepresentativeDialogComponent`), que devolve o valor já validado.
 */
@Component({
  selector: 'app-client-representatives',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ClientRepresentativeDialogComponent],
  templateUrl: './client-representatives.component.html',
  styleUrl: './client-representatives.component.scss',
})
export class ClientRepresentativesComponent {
  readonly array = input.required<FormArray<RepresentanteGroup>>();
  readonly titulo = input<string>('Representantes legais');

  protected readonly editing = signal<EditingRepresentante | null>(null);

  protected openNew(): void {
    this.editing.set({ index: -1, value: null });
  }

  protected openEdit(index: number): void {
    this.editing.set({ index, value: this.array().at(index).getRawValue() });
  }

  protected closeDialog(): void {
    this.editing.set(null);
  }

  protected remove(index: number): void {
    this.array().removeAt(index);
    this.array().markAsDirty();
  }

  protected onSaved(value: IRepresentanteLegal): void {
    const editing = this.editing();
    if (!editing) {
      return;
    }

    const group = createRepresentanteGroup(value);
    if (editing.index < 0) {
      this.array().push(group);
    } else {
      this.array().setControl(editing.index, group);
    }
    this.array().markAsDirty();
    this.closeDialog();
  }
}
