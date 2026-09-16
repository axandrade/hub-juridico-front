import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FormControl } from '@angular/forms';

import { DomainModelDropdownComponent } from '../../../../shared/components/domain-dropdown/domain-model-dropdown.component';
import { DossierGroup } from '../../forms/client-form.factory';
import { DOSSIER_FIELDS } from '../../models/client-form.model';
import { ClientFieldComponent } from '../client-field/client-field.component';

/** Item cru de `/domain/advogado` — só o que o picker de "Responsável interno" usa. */
interface AdvogadoDomain {
  id: number;
  nome: string;
}

/**
 * Aba "Administrativo" — o dossiê do escritório (`form.controls.dossier`). "Responsável
 * interno" é o único campo com UI especial: em vez de texto livre, busca entre os advogados
 * cadastrados via `DomainModelDropdownComponent` (`/domain/advogado`) — mesma ideia do picker
 * "Advogado responsável" de Processos (`ProcessoService.buscarAdvogados` + `<app-combobox>`),
 * só que com o dropdown genérico novo em vez do antigo (que aliás está quebrado hoje: bate em
 * `/api/v1/advogados`, removido junto com `AdvogadoController` no piloto). Os nomes do seed
 * ("Dra. Helena", "Dr. Rodrigo"...) batem com advogados reais cadastrados (`Helena Martins
 * Vasconcelos`...), confirmando que o campo sempre foi pra ser um advogado, não um usuário do
 * sistema (só 2 cadastrados hoje). Continua sendo uma string livre no backend
 * (`Pessoa.responsavelInterno`, sem FK pra `advogados`), só a UI de preenchimento muda.
 */
@Component({
  selector: 'app-client-admin-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ClientFieldComponent, DomainModelDropdownComponent],
  templateUrl: './client-admin-form.component.html',
  styleUrl: './client-admin-form.component.scss',
})
export class ClientAdminFormComponent {
  readonly group = input.required<DossierGroup>();

  protected readonly rows = DOSSIER_FIELDS;
  protected readonly rotuloAdvogado = (a: Record<string, unknown>): string =>
    String((a as unknown as AdvogadoDomain).nome ?? '');

  protected control(key: string): FormControl<string> {
    return this.group().get(key) as FormControl<string>;
  }

  protected onResponsavelSelecionado(item: Record<string, unknown> | null): void {
    if (!item) {
      return;
    }
    const advogado = item as unknown as AdvogadoDomain;
    this.control('internalOwner').setValue(advogado.nome);
    this.control('internalOwner').markAsDirty();
  }
}
