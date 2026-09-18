import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { EMPTY, Observable, catchError, map, of, switchMap } from 'rxjs';

import { DomainFavoritoService } from '../../../core/services/domain-favorito.service';
import { DomainService, IDomainPage } from '../../../core/services/domain.service';
import { DateFormatPipe } from '../../pipes/date-format.pipe';
import { CurrencyFormatPipe } from '../../pipes/currency-format.pipe';
import { BadgeComponent } from '../badge/badge.component';
import { TableColumn } from '../table/table-column.model';
import { TablePagination, TableSort } from '../table/table.model';

/**
 * Tabela "domain-aware": mesmo conceito do `DomainModelTableComponent` do cev-front
 * (`@b2software/domain-ng`) — dado só `entityName`, ela busca sozinha em
 * `/domain/{entityName}` (ddd-noap), com paginação, ordenação e filtro RQL, sem o pai
 * orquestrar `HttpClient` nenhum.
 *
 * Visualmente idêntica ao `DataTableComponent` (mesmas classes/estilos), mas é um
 * componente separado de propósito — não convém acoplar a tabela "burra" (usada em
 * Clientes/Processos/Usuários) a uma dependência de rede.
 *
 * Favoritar é nativo daqui (todas as telas do sistema têm essa coluna — ver Clientes/Processos):
 * usa a entidade genérica `Favorito` via `/domain/favorito` (`DomainFavoritoService`), com
 * `tipoEntidade = entityName()` — nenhuma tela precisa fiar nada, só existe (a menos que
 * `favoritable` seja explicitamente desligado). Sem coluna de `id` visível nenhuma: o id da
 * linha vem de `trackKey` (ou `'id'` por padrão).
 *
 * Favorito sempre fica fixo no topo da listagem, mesmo vindo de outra página (achado real
 * 2026-09-17: existia isso numa tela antiga de Clientes, comparador local, perdido na migração
 * pra cá). Cada busca resolve TODOS os favoritos do tipo de entidade primeiro
 * (`DomainFavoritoService.listarTodosFavoritos`, sem paginação — teto de 500), busca a ficha
 * completa deles (`pinnedRows`) e exclui esses ids da busca paginada normal (`id ne X and id ne
 * Y...`, seguro sob a avaliação estrita-da-esquerda-pra-direita do RQL porque só usa `and` —
 * nunca duplica: um favorito aparece uma vez só, fixo). `total_elements`/`total_pages` refletem
 * só o restante (não contam quem já está fixo). Favorito fixo NÃO respeita a busca livre
 * (`filter`) — só o predicado `isRowActive`, se informado: um registro inativo nunca fixa, e o
 * botão de favoritar fica desabilitado nele (não dá pra favoritar/manter favoritado algo
 * inativo).
 *
 * Recursos do `DataTableComponent` que este componente NÃO tem (cortados por não serem
 * necessários no piloto de Advogados): busca client-side, filtro por coluna, tooltip de linha.
 * `filter`/`sort` aqui são resolvidos no servidor via RQL, não localmente.
 */
@Component({
  selector: 'app-domain-model-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DateFormatPipe, CurrencyFormatPipe, BadgeComponent],
  templateUrl: './domain-model-table.component.html',
  styleUrl: './domain-model-table.component.scss',
})
export class DomainModelTableComponent<T extends object> {
  private readonly domainService = inject(DomainService);
  private readonly domainFavoritoService = inject(DomainFavoritoService);

  /** Nome da entidade em kebab-case, igual ao backend resolve (`EntityFinder`) — ex.: `'advogado'`. */
  readonly entityName = input.required<string>();
  readonly columns = input.required<TableColumn<T>[]>();
  /** `fields=` — campos a pedir ao backend; vazio = conjunto padrão do backend. */
  readonly fields = input<string>('');
  /** RQL — filtro base/atual, resolvido pelo pai (ex.: busca + `ativo eq true`). */
  readonly filter = input<string>('');
  /** Ordenação padrão (`campo` ou `-campo`); sobrescrita ao clicar no cabeçalho, se `sortable`. */
  readonly sort = input<string>('');
  readonly size = input<number>(10);
  readonly sortable = input<boolean>(false);
  readonly trackKey = input<string | null>(null);
  readonly emptyMessage = input<string>('Nenhum registro encontrado.');
  readonly rowClass = input<((row: T) => Record<string, boolean>) | null>(null);

  readonly columnVisibility = input<boolean>(false);
  readonly columnsToolbar = input<boolean>(true);
  readonly defaultVisibleColumns = input<readonly string[] | null>(null);
  /** Toda tabela tem favoritar por padrão — desligue só se a entidade genuinamente não fizer sentido favoritar. */
  readonly favoritable = input<boolean>(true);
  /** Sem isso, todo registro é favoritável. Quando informado, um registro "inativo" nunca fixa como favorito e o botão de favoritar fica desabilitado nele. */
  readonly isRowActive = input<((row: T) => boolean) | null>(null);
  /**
   * Liga ícones de ação (editar/excluir) numa coluna própria à direita da linha, fora do
   * `rowClick` — sem nenhum dos dois, a coluna nem existe. Cada um cuida da sua própria
   * confirmação/persistência (o componente só emite o clique).
   */
  readonly editAction = input<((row: T) => void) | null>(null);
  readonly editIcon = input<string>('fa-solid fa-pen');
  readonly editAriaLabel = input<string>('Editar');
  readonly deleteAction = input<((row: T) => void) | null>(null);
  readonly deleteIcon = input<string>('fa-solid fa-trash');
  readonly deleteAriaLabel = input<string>('Excluir');

  readonly rowClick = output<T>();
  /** Emitido a cada busca bem-sucedida — espelha `getCurrentDataList` do cev-front. */
  readonly dataLoaded = output<T[]>();

  private readonly page = signal(0);
  private readonly sortOverride = signal<TableSort | null>(null);
  private readonly visibleKeysOverride = signal<Set<string> | null>(null);
  readonly columnsMenuOpen = signal(false);

  private readonly rows = signal<T[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal(false);
  private readonly pageInfo = signal<TablePagination | null>(null);
  readonly pagination = this.pageInfo.asReadonly();

  /** entidadeId -> id da linha `Favorito` (precisa do id pra desfavoritar via DELETE). */
  private readonly favoritoMap = signal<Map<number, number>>(new Map());
  private readonly favoritoBusy = signal<Set<number>>(new Set());
  /** Fichas completas de todos os favoritos do tipo de entidade — sempre fixos no topo. */
  private readonly pinnedRows = signal<T[]>([]);

  protected readonly visibleColumns = computed(() => {
    if (!this.columnVisibility()) {
      return this.columns();
    }
    const keys = this.visibleKeysOverride() ?? this.defaultVisibleKeys();
    return this.columns().filter((column) => keys.has(column.key));
  });

  protected readonly hasRowActions = computed(() => this.editAction() !== null || this.deleteAction() !== null);

  protected readonly colspan = computed(
    () => this.visibleColumns().length + (this.favoritable() ? 1 : 0) + (this.hasRowActions() ? 1 : 0),
  );

  /** Favoritos fixos sempre primeiro, independente da paginação/ordenação do resto. */
  protected readonly displayRows = computed(() => [...this.pinnedRows(), ...this.rows()]);

  private lastQueryKey: string | null = null;
  private requestSeq = 0;

  constructor() {
    effect(() => {
      const entityName = this.entityName();
      const filter = this.filter();
      const sortInput = this.sort();
      const size = this.size();
      const fields = this.fields();
      const override = this.sortOverride();
      const effectiveSort = override ? this.formatSort(override) : sortInput;
      const key = `${entityName}|${filter}|${effectiveSort}|${size}|${fields}`;
      if (key !== this.lastQueryKey) {
        this.lastQueryKey = key;
        this.page.set(0);
      }
      const page = this.page();
      untracked(() => this.fetch(entityName, page, effectiveSort, filter, fields, size));
    });
  }

  /** Refaz a busca da página atual — o pai chama isso (via `viewChild`) depois de salvar/excluir. */
  reload(): void {
    this.fetch(this.entityName(), this.page(), this.currentSort(), this.filter(), this.fields(), this.size());
  }

  toggleColumnsMenu(): void {
    this.columnsMenuOpen.update((open) => !open);
  }

  isColumnVisible(key: string): boolean {
    const keys = this.visibleKeysOverride() ?? this.defaultVisibleKeys();
    return keys.has(key);
  }

  toggleColumnVisibility(key: string): void {
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
    const current = this.sortOverride();
    this.sortOverride.set(
      current?.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    );
  }

  protected sortIcon(key: string): string {
    const sort = this.sortOverride();
    if (sort?.key !== key) {
      return 'fa-solid fa-sort';
    }
    return sort.direction === 'asc' ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down';
  }

  protected requestPage(delta: -1 | 1): void {
    const info = this.pageInfo();
    if (!info) {
      return;
    }
    const next = info.page + delta;
    if (next < 0 || (delta > 0 && info.last)) {
      return;
    }
    this.page.set(next);
  }

  protected pageCountLabel(info: TablePagination): number {
    return Math.max(info.totalPages, 1);
  }

  protected cellValue(row: T, column: TableColumn<T>): unknown {
    return row[column.key as keyof T];
  }

  protected dateValue(row: T, column: TableColumn<T>): Date | string | number | null {
    const raw = this.cellValue(row, column);
    return raw instanceof Date || typeof raw === 'string' || typeof raw === 'number' ? raw : null;
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

  protected rowId(row: T): number {
    const key = this.trackKey() ?? 'id';
    return row[key as keyof T] as unknown as number;
  }

  protected isFavorito(row: T): boolean {
    return this.favoritoMap().has(this.rowId(row));
  }

  protected rowClasses(row: T): Record<string, boolean> {
    return { ...this.rowClass()?.(row), 'is-favorite': this.isFavorito(row) };
  }

  protected isFavoritoBusy(row: T): boolean {
    return this.favoritoBusy().has(this.rowId(row));
  }

  /** Sem `isRowActive`, tudo é favoritável. Com ele, um registro inativo nunca é. */
  protected isRowFavoritable(row: T): boolean {
    const predicate = this.isRowActive();
    return !predicate || predicate(row);
  }

  protected onEditClick(row: T, event: MouseEvent): void {
    event.stopPropagation();
    this.editAction()?.(row);
  }

  protected onDeleteClick(row: T, event: MouseEvent): void {
    event.stopPropagation();
    this.deleteAction()?.(row);
  }

  protected toggleFavorito(row: T, event: MouseEvent): void {
    event.stopPropagation();
    const id = this.rowId(row);
    if (this.favoritoBusy().has(id) || !this.isRowFavoritable(row)) {
      return;
    }
    this.favoritoBusy.update((busy) => new Set(busy).add(id));
    const existingFavoritoId = this.favoritoMap().get(id);
    const request$ = existingFavoritoId != null
      ? this.domainFavoritoService.desfavoritar(existingFavoritoId).pipe(map(() => undefined))
      : this.domainFavoritoService.favoritar(this.entityName(), id).pipe(map(() => undefined));

    // Refaz a busca inteira (pinned + página) em vez de só corrigir o Map local: é o jeito mais
    // simples de manter `pinnedRows`/exclusão da paginação normal consistentes com o servidor.
    request$.subscribe({
      next: () => {
        this.clearFavoritoBusy(id);
        this.reload();
      },
      error: () => this.clearFavoritoBusy(id),
    });
  }

  private clearFavoritoBusy(id: number): void {
    this.favoritoBusy.update((busy) => {
      const next = new Set(busy);
      next.delete(id);
      return next;
    });
  }

  /**
   * Busca todos os favoritos do tipo de entidade, fixa suas fichas completas em `pinnedRows` e
   * devolve os ids — pra excluir da busca paginada normal logo em seguida (`fetch`), evitando
   * duplicata. Um favorito reprovado por `isRowActive` (inativo) simplesmente não fixa.
   */
  private resolvePinned(entityName: string, fields: string): Observable<number[]> {
    if (!this.favoritable()) {
      this.pinnedRows.set([]);
      this.favoritoMap.set(new Map());
      return of([]);
    }
    return this.domainFavoritoService.listarTodosFavoritos(entityName).pipe(
      switchMap((favoritoMap) => {
        this.favoritoMap.set(favoritoMap);
        const ids = [...favoritoMap.keys()];
        if (ids.length === 0) {
          this.pinnedRows.set([]);
          return of([]);
        }
        const filter = ids.map((id) => `id eq ${id}`).join(' or ');
        return this.domainService
          .get<IDomainPage<T>>({ entityName, filter, fields: fields || undefined, size: ids.length })
          .pipe(
            map((result) => {
              const predicate = this.isRowActive();
              const rows = predicate ? result.content.filter((row) => predicate(row)) : result.content;
              this.pinnedRows.set(rows);
              return rows.map((row) => this.rowId(row));
            }),
          );
      }),
      catchError(() => {
        this.pinnedRows.set([]);
        return of([]);
      }),
    );
  }

  private currentSort(): string {
    const override = this.sortOverride();
    return override ? this.formatSort(override) : this.sort();
  }

  private formatSort(sort: TableSort): string {
    return sort.direction === 'desc' ? `-${sort.key}` : sort.key;
  }

  private fetch(entityName: string, page: number, sort: string, filter: string, fields: string, size: number): void {
    const seq = ++this.requestSeq;
    this.loading.set(true);
    this.resolvePinned(entityName, fields)
      .pipe(
        switchMap((pinnedIds) => {
          // `and` sempre estreita o que já foi acumulado, então anexar isso no fim de um
          // `filter` que já tem seus próprios `or`s internos continua seguro sob a avaliação
          // estrita-da-esquerda-pra-direita do RQL (sem parênteses) — diferente de um `or`
          // anexado, que reabriria a expressão.
          const exclusao = pinnedIds.map((id) => `id ne ${id}`).join(' and ');
          const filtroEfetivo = [filter, exclusao].filter(Boolean).join(' and ');
          return this.domainService.get<IDomainPage<T>>({
            entityName,
            page,
            size,
            filter: filtroEfetivo || undefined,
            sort: sort || undefined,
            fields: fields || undefined,
          });
        }),
        catchError(() => {
          if (seq === this.requestSeq) {
            this.loading.set(false);
            this.loadError.set(true);
            this.rows.set([]);
            this.pageInfo.set(null);
          }
          return EMPTY;
        }),
      )
      .subscribe((result) => {
        if (seq !== this.requestSeq) {
          return;
        }
        this.loading.set(false);
        this.loadError.set(false);
        this.rows.set(result.content);
        this.pageInfo.set({
          page: result.number,
          totalPages: result.total_pages,
          totalElements: result.total_elements,
          last: result.last,
        });
        this.dataLoaded.emit(result.content);
      });
  }
}
