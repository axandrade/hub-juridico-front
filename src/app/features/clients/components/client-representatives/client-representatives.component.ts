import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { FormArray } from '@angular/forms';

import { maskDocumento } from '../../../../core/auth/documentos-br';
import { IRepresentanteLegal } from '../../../../core/models';
import { DomainModelDropdownComponent } from '../../../../shared/components/domain-dropdown/domain-model-dropdown.component';
import { RepresentanteGroup, createRepresentanteGroup } from '../../forms/client-form.factory';
import {
  RepresentanteDomain,
  REPRESENTANTE_STANDALONE_DOMAIN_FIELDS,
  representanteFromDomain,
} from '../../services/client-mapper';
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
  imports: [ClientRepresentativeDialogComponent, DomainModelDropdownComponent],
  templateUrl: './client-representatives.component.html',
  styleUrl: './client-representatives.component.scss',
})
export class ClientRepresentativesComponent {
  readonly array = input.required<FormArray<RepresentanteGroup>>();
  readonly titulo = input<string>('Representantes legais');
  /** Qual catálogo (`/domain/representante-legal|financeiro`) os pickers buscam. */
  readonly tipo = input<'legal' | 'financeiro'>('legal');

  protected readonly editing = signal<EditingRepresentante | null>(null);

  /**
   * Picker direto no painel (igual "Advogado responsável" de Processos) — busca e já adiciona
   * ao array na hora, sem abrir o dialog. O dialog (`ClientRepresentativeDialogComponent`)
   * continua existindo pra cadastrar do zero ou editar um já adicionado; este é só um atalho
   * pra reaproveitar um representante já cadastrado em outro cliente.
   */
  protected readonly entityName = computed(() =>
    this.tipo() === 'legal' ? 'representante-legal' : 'representante-financeiro',
  );
  protected readonly camposBusca = ['nome', 'documento'] as const;
  protected readonly camposExistente = REPRESENTANTE_STANDALONE_DOMAIN_FIELDS;
  protected readonly rotuloExistente = (r: Record<string, unknown>): string => {
    const rep = r as unknown as RepresentanteDomain;
    return `${rep.nome} — ${maskDocumento(rep.documento ?? '')}`;
  };

  protected onExistenteSelecionado(item: Record<string, unknown> | null): void {
    if (!item) {
      return;
    }
    this.array().push(createRepresentanteGroup(representanteFromDomain(item as unknown as RepresentanteDomain)));
    this.array().markAsDirty();
  }

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
