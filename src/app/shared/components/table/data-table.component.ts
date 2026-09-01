import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import { DateFormatPipe } from '../../pipes/date-format.pipe';
import { CurrencyFormatPipe } from '../../pipes/currency-format.pipe';
import { BadgeComponent } from '../badge/badge.component';
import { TableColumn } from './table-column.model';
import { TablePagination, TablePinAction, TableSort } from './table.model';

/**
 * Tabela de dados genérica, estilizada com a paleta botânica.
 *
 * Puramente apresentacional: nunca busca dados sozinha. Recebe `data` (linhas já
 * carregadas) e, opcionalmente, `pagination` (estado de paginação já resolvido pelo
 * pai) — navegar de página só emite `pageChange`, quem decide o que fazer é o
 * componente pai (chamar o store, debounce, tratar erro etc.).
 *
 * Todos os recursos além de `columns`/`data` são opt-in (desligados por padrão), então
 * um uso simples como o do dashboard continua funcionando sem nenhuma mudança. Filtro por
 * coluna (`column.filter`) some da linha de cabeçalho extra se nenhuma coluna visível tiver um.
 */
@Component({
  selector: 'app-data-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DateFormatPipe, CurrencyFormatPipe, BadgeComponent],
  templateUrl: './data-table.component.html',
  styleUrl: './data-table.component.scss',
})
export class DataTableComponent<T extends object> {
  readonly columns = input.required<TableColumn<T>[]>();
  readonly data = input.required<T[]>();
  readonly loading = input<boolean>(false);
  readonly emptyMessage = input<string>('Nenhum registro encontrado.');
  readonly trackKey = input<string | null>(null);

  readonly rowClick = output<T>();

  /** Habilita clique no cabeçalho pra ordenar. */
  readonly sortable = input<boolean>(false);
  /** Ordenação inicial (só lida uma vez, na primeira renderização). */
  readonly initialSort = input<TableSort | null>(null);

  /** Habilita o botão/dropdown "Colunas" (mostrar/ocultar). */
  readonly columnVisibility = input<boolean>(false);
  /** Colunas visíveis por padrão (por `key`); `null` = todas. */
  readonly defaultVisibleColumns = input<readonly string[] | null>(null);

  /** Busca livre client-side (aplicada sobre `data`, não refaz requisição). */
  readonly searchQuery = input<string>('');
  /** Monta o texto pesquisável de uma linha; sem isso, `searchQuery` não tem efeito. */
  readonly searchableText = input<((row: T) => string) | null>(null);

  /** Predicado extra de filtro, calculado pelo pai a partir da sua própria UI de filtros. */
  readonly filterPredicate = input<((row: T) => boolean) | null>(null);
  /** Linhas para as quais isso retorna `true` sobem para o topo, antes da ordenação normal. */
  readonly pinFirst = input<((row: T) => boolean) | null>(null);
  /** Classes extras por linha (ex.: `is-selected`, `is-inactive`). */
  readonly rowClass = input<((row: T) => Record<string, boolean>) | null>(null);
  /** Coluna de ação fixa (ex.: favoritar) desenhada pela própria tabela. */
  readonly pinAction = input<TablePinAction<T> | null>(null);

  /** Valor atual do filtro por coluna (chave = `column.key`), controlado pelo pai. */
  readonly columnFilterValues = input<Record<string, string> | null>(null);
  /** Emitido quando um filtro de coluna é confirmado (Enter no texto, troca no select). */
  readonly columnFilterChange = output<{ key: string; value: string }>();

  /** Estado de paginação já carregado; `null` = sem rodapé de paginação. */
  readonly pagination = input<TablePagination | null>(null);
  /** Página (0-based) pedida via Anterior/Próxima — quem busca é o pai. */
  readonly pageChange = output<number>();

  private readonly sortOverride = signal<TableSort | null>(null);
  private readonly visibleKeysOverride = signal<Set<string> | null>(null);
  protected readonly columnsMenuOpen = signal(false);

  protected readonly effectiveSort = computed(() => this.sortOverride() ?? this.initialSort());

  protected readonly visibleColumns = computed(() => {
    if (!this.columnVisibility()) {
      return this.columns();
    }
    const keys = this.visibleKeysOverride() ?? this.defaultVisibleKeys();
    return this.columns().filter((column) => keys.has(column.key));
  });

  protected readonly rows = computed(() => {
    let rows = this.data();

    const filterFn = this.filterPredicate();
    if (filterFn) {
      rows = rows.filter(filterFn);
    }

    const searchFn = this.searchableText();
    const terms = this.parseSearchTerms(this.searchQuery());
    if (searchFn && terms.length) {
      rows = rows.filter((row) => {
        const haystack = this.normalizeKey(searchFn(row));
        return terms.every((term) => haystack.includes(this.normalizeKey(term)));
      });
    }

    const sort = this.effectiveSort();
    const pin = this.pinFirst();
    if (sort || pin) {
      const column = this.columns().find((item) => item.key === sort?.key);
      const direction = sort?.direction === 'desc' ? -1 : 1;
      rows = [...rows].sort((a, b) => {
        if (pin) {
          const pinnedA = pin(a);
          const pinnedB = pin(b);
          if (pinnedA !== pinnedB) {
            return pinnedA ? -1 : 1;
          }
        }
        if (!column) {
          return 0;
        }
        return this.compareValues(this.displayValue(a, column), this.displayValue(b, column)) * direction;
      });
    }

    return rows;
  });

  protected readonly colspan = computed(() => this.visibleColumns().length + (this.pinAction() ? 1 : 0));

  protected readonly hasColumnFilters = computed(() => this.visibleColumns().some((column) => column.filter));

  protected columnFilterValue(key: string): string {
    return this.columnFilterValues()?.[key] ?? '';
  }

  protected submitColumnFilter(key: string, value: string): void {
    this.columnFilterChange.emit({ key, value });
  }

  protected toggleColumnsMenu(): void {
    this.columnsMenuOpen.update((open) => !open);
  }

  protected isColumnVisible(key: string): boolean {
    const keys = this.visibleKeysOverride() ?? this.defaultVisibleKeys();
    return keys.has(key);
  }

  protected toggleColumnVisibility(key: string): void {
    const next = new Set(this.visibleKeysOverride() ?? this.defaultVisibleKeys());
    if (next.has(key)) {
      if (next.size > 1) {
        next.delete(key);
      }
    } else {
      next.add(key);
    }
    this.visibleKeysOverride.set(next);
  }

  private defaultVisibleKeys(): Set<string> {
    const defaults = this.defaultVisibleColumns();
    return defaults ? new Set(defaults) : new Set(this.columns().map((column) => column.key));
  }

  protected sortBy(key: string): void {
    const current = this.effectiveSort();
    this.sortOverride.set(
      current?.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    );
  }

  protected sortIcon(key: string): string {
    const sort = this.effectiveSort();
    if (sort?.key !== key) {
      return 'fa-solid fa-sort';
    }
    return sort.direction === 'asc' ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down';
  }

  protected requestPage(delta: -1 | 1): void {
    const pagination = this.pagination();
    if (!pagination) {
      return;
    }
    const next = pagination.page + delta;
    if (next < 0 || (delta > 0 && pagination.last)) {
      return;
    }
    this.pageChange.emit(next);
  }

  protected pageCountLabel(pagination: TablePagination): number {
    return Math.max(pagination.totalPages, 1);
  }

  protected cellValue(row: T, column: TableColumn<T>): unknown {
    return row[column.key as keyof T];
  }

  protected dateValue(row: T, column: TableColumn<T>): Date | string | number | null {
    const raw = this.cellValue(row, column);
    return raw instanceof Date || typeof raw === 'string' || typeof raw === 'number'
      ? raw
      : null;
  }

  protected numberValue(row: T, column: TableColumn<T>): number | string | null {
    const raw = this.cellValue(row, column);
    return typeof raw === 'number' || typeof raw === 'string' ? raw : null;
  }

  protected displayValue(row: T, column: TableColumn<T>): string {
    const raw = this.cellValue(row, column);
    if (column.formatter) {
      return column.formatter(raw, row);
    }
    return raw == null ? '' : String(raw);
  }

  protected badgeTone(row: T, column: TableColumn<T>): 'primary' | 'success' | 'warning' | 'danger' | 'neutral' {
    return column.badgeTone?.(this.cellValue(row, column), row) ?? 'primary';
  }

  protected trackRow = (index: number, row: T): unknown => {
    const key = this.trackKey();
    return key ? row[key as keyof T] : index;
  };

  private parseSearchTerms(value: string): string[] {
    const matches = value.trim().match(/"[^"]+"|\S+/g) ?? [];
    return matches.map((term) => term.replace(/^"|"$/g, '')).filter(Boolean);
  }

  private compareValues(left: string, right: string): number {
    return left.localeCompare(right, 'pt-BR', { numeric: true, sensitivity: 'base' });
  }

  private normalizeKey(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();
  }
}
