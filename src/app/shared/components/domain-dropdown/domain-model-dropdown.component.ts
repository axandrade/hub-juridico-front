import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { Observable, catchError, map, of, tap } from 'rxjs';

import { DomainService, IDomainPage } from '../../../core/services/domain.service';
import { ComboboxComponent, ComboEdicao, ComboPagina } from '../combobox/combobox.component';

/**
 * Combobox "domain-aware": mesmo conceito do `DomainModelDropdownComponent` do cev-front
 * (`@b2software/domain-ng`) — dado só `entityName`, ele busca sozinho em `/domain/{entityName}`
 * (ddd-noap), paginado, com busca livre (RQL `ilike`) e filtro base fixo. Espelha o
 * `DomainModelTableComponent` (mesma ideia pra listagem) usando a MESMA ideia de reaproveitar o
 * `<app-combobox>` já existente (que já tem busca paginada remota via `[buscarPagina]`,
 * scroll-to-load, teclado, clique-fora etc.) em vez de recriar um dropdown do zero — não há
 * PrimeNG neste projeto (decisão já tomada pro `DomainModelTableComponent`).
 *
 * Ao contrário da tabela (colunas fixas por `TableColumn`), o rótulo de cada item é livre:
 * `displayFormatter` recebe o item cru (mesmo shape de `/domain/{entity}`, camelCase) e devolve
 * a string a mostrar — cobre tanto entidades simples (`(p) => p['nome']`) quanto compostas/
 * polimórficas (ex.: Pessoa física vs jurídica, como `clientDisplayName` faz em
 * `clients.component.ts`). `fields` deve incluir tudo que `displayFormatter` usa; `valueField`
 * é sempre incluído automaticamente.
 *
 * Gestão do catálogo pelo menu "⋮" do `app-combobox` interno: liga `adicionar`/`editar`/`excluir`
 * e escute `aoAdicionar`/`aoEditar`/`aoExcluir` — mesmo contrato do `ComboboxComponent`, só
 * repassado. Quem persiste (POST/PATCH/DELETE) continua sendo o pai.
 */
@Component({
  selector: 'app-domain-model-dropdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ComboboxComponent],
  templateUrl: './domain-model-dropdown.component.html',
})
export class DomainModelDropdownComponent<T extends Record<string, unknown>> {
  private readonly domainService = inject(DomainService);

  /** Nome da entidade em kebab-case, igual ao backend resolve (`EntityFinder`) — ex.: `'pessoa'`. */
  readonly entityName = input.required<string>();
  /** `fields=` — deve cobrir `valueField` (auto-incluído se faltar) + tudo que `displayFormatter` usa. */
  readonly fields = input<string>('');
  /** Campos combinados com `or`/`ilike` para a busca livre digitada no campo. Vazio = sem busca por texto (só pagina). */
  readonly searchFields = input<readonly string[]>([]);
  /** RQL — filtro base, sempre aplicado (AND) além da cláusula de busca. */
  readonly filter = input<string>('');
  readonly sort = input<string>('');
  readonly size = input<number>(10);
  /** Campo usado como valor/id do item — default `'id'`. */
  readonly valueField = input<string>('id');
  /** Monta o rótulo exibido a partir do item cru (`/domain/{entity}`, camelCase). */
  readonly displayFormatter = input.required<(item: T) => string>();

  readonly value = input<string>('');
  /** Rótulo do valor atual, para quando a página dele ainda não foi carregada (ver `resolver`). */
  readonly valueLabel = input<string>('');
  readonly placeholder = input<string>('');
  readonly emptyLabel = input<string>('');
  readonly ariaLabel = input<string>('');
  readonly disabled = input<boolean>(false);
  readonly noResultsText = input<string>('Nenhum resultado');
  readonly itemNoun = input<string>('item');

  /** Liga a opção "Adicionar" no menu "⋮" do `app-combobox` interno. */
  readonly adicionar = input<boolean>(false);
  /** Liga a opção "Editar" no menu "⋮". */
  readonly editar = input<boolean>(false);
  /** Liga a opção "Excluir" no menu "⋮". */
  readonly excluir = input<boolean>(false);

  readonly valueChange = output<string>();
  /** Emitido junto com `valueChange` — o item cru selecionado, ou `null` (opção vazia/sem cache). */
  readonly itemSelected = output<T | null>();
  /** Repassado do `app-combobox` interno — confirmou "Adicionar" (nome digitado). Quem persiste é o pai. */
  readonly aoAdicionar = output<string>();
  /** Repassado do `app-combobox` interno — confirmou "Editar" (`valor` do item, não o nome — ver `ComboboxComponent`). */
  readonly aoEditar = output<ComboEdicao>();
  /** Repassado do `app-combobox` interno — confirmou "Excluir" (`valor` do item). */
  readonly aoExcluir = output<string>();

  /** Itens já vistos nesta sessão (páginas carregadas), por valor — evita um GET extra em `resolver`. */
  private readonly vistos = new Map<string, T>();

  protected readonly buscarPagina = (termo: string, pagina: number): Observable<ComboPagina> => {
    const clausulas: string[] = [];
    const termoLimpo = termo.trim().replace(/'/g, '');
    const camposBusca = this.searchFields();
    if (termoLimpo && camposBusca.length > 0) {
      clausulas.push(camposBusca.map((campo) => `${campo} ilike '*${termoLimpo}*'`).join(' or '));
    }
    const base = this.filter().trim();
    if (base) {
      clausulas.push(base);
    }

    return this.domainService
      .get<IDomainPage<T>>({
        entityName: this.entityName(),
        page: pagina,
        size: this.size(),
        fields: this.effectiveFields() || undefined,
        filter: clausulas.join(' and ') || undefined,
        sort: this.sort() || undefined,
      })
      .pipe(
        tap((pagina) => pagina.content.forEach((item) => this.vistos.set(this.itemValue(item), item))),
        map((pagina) => ({
          itens: pagina.content.map((item) => ({
            valor: this.itemValue(item),
            rotulo: this.displayFormatter()(item),
          })),
          ultima: pagina.last,
        })),
        catchError(() => of({ itens: [], ultima: true })),
      );
  };

  protected onValueChange(valor: string): void {
    this.valueChange.emit(valor);
    this.itemSelected.emit(valor ? this.vistos.get(valor) ?? null : null);
  }

  /**
   * Item completo por valor — do cache das páginas já vistas, ou `GET /domain/{entity}/{valor}`
   * direto (mesmo papel do `ProcessoService.rotuloPessoa`, mas genérico pra qualquer entidade).
   * Útil pra montar `valueLabel` ao carregar um valor já persistido, sem escrever um service por
   * entidade.
   */
  resolver(valor: string): Observable<T | null> {
    if (!valor) {
      return of(null);
    }
    const cache = this.vistos.get(valor);
    if (cache) {
      return of(cache);
    }
    return this.domainService
      .get<T>({ entityName: this.entityName(), entityId: valor, fields: this.effectiveFields() || undefined })
      .pipe(
        tap((item) => this.vistos.set(valor, item)),
        catchError(() => of(null)),
      );
  }

  private itemValue(item: T): string {
    return String(item[this.valueField() as keyof T]);
  }

  private effectiveFields(): string {
    const fields = this.fields().trim();
    const valueField = this.valueField();
    if (!fields) {
      return valueField;
    }
    const lista = fields.split(',').map((f) => f.trim());
    return lista.includes(valueField) ? fields : `${valueField},${fields}`;
  }
}
