import { DOCUMENT } from '@angular/common';
import { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
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
import { ColumnVisibilityController } from '../../column-visibility/column-visibility.controller';
import { DateFormatPipe } from '../../pipes/date-format.pipe';
import { CurrencyFormatPipe } from '../../pipes/currency-format.pipe';
import { BadgeComponent } from '../badge/badge.component';
import { ColumnsMenuComponent } from '../columns-menu/columns-menu.component';
import { TableColumn } from '../table/table-column.model';
import { TablePagination, TablePinAction, TableSort } from '../table/table.model';

/**
 * Tabela "domain-aware": mesmo conceito do `DomainModelTableComponent` do cev-front
 * (`@b2software/domain-ng`) — dado só `entityName`, ela busca sozinha em
 * `/domain/{entityName}` (ddd-noap), com paginação, ordenação e filtro RQL, sem o pai
 * orquestrar `HttpClient` nenhum.
 *
 * A tabela padrão do sistema — dois modos, mutuamente exclusivos por instância:
 *
 * 1. **`entityName`** (Advogados/Clientes): busca sozinha em `/domain/{entityName}`, com
 *    paginação/ordenação/filtro resolvidos no servidor via RQL, e favoritar nativo (ver abaixo).
 * 2. **`data`** (Processos): o pai já buscou os dados (ex.: `ProcessoService`, que resolve nomes
 *    de ids relacionados — `clientePrincipalId` → nome — que `/domain/processo` cru não tem) e
 *    só alimenta a tabela; paginação vira input (`[pagination]`)/output (`(pageChange)`), e
 *    `sortable`/`initialSort`/`pinFirst`/`rowTitle`/`pinAction` resolvem tudo no cliente, igual o
 *    `DataTableComponent` — que fica reservado a telas mais simples sem rede (dashboard/usuários).
 *    `favoritable` não funciona nesse modo (não tem `entityName` pra chamar `/domain/favorito`) —
 *    use `pinFirst`/`pinAction` pra favoritar do jeito próprio da tela, como a Processos faz.
 *
 * Favoritar é nativo no modo `entityName` (todas as telas desse modo têm essa coluna — ver
 * Clientes/Advogados): usa a entidade genérica `Favorito` via `/domain/favorito`
 * (`DomainFavoritoService`), com `tipoEntidade = entityName()` — nenhuma tela precisa fiar nada,
 * só existe (a menos que `favoritable` seja explicitamente desligado). Sem coluna de `id` visível
 * nenhuma: o id da linha vem de `trackKey` (ou `'id'` por padrão).
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
 */
@Component({
  selector: 'app-domain-model-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DateFormatPipe, CurrencyFormatPipe, BadgeComponent, ColumnsMenuComponent, CdkDropList, CdkDrag],
  templateUrl: './domain-model-table.component.html',
  styleUrl: './domain-model-table.component.scss',
})
export class DomainModelTableComponent<T extends object> {
  private readonly domainService = inject(DomainService);
  private readonly domainFavoritoService = inject(DomainFavoritoService);
  private readonly document = inject(DOCUMENT);

  /**
   * Nome da entidade em kebab-case, igual ao backend resolve (`EntityFinder`) — ex.: `'advogado'`.
   * Obrigatório só no modo `entityName` (busca sozinha); ausente/`null` quando `data` é usado.
   */
  readonly entityName = input<string | null>(null);
  /** Modo `data`: linhas já buscadas pelo pai — desliga a busca própria via `/domain/{entityName}`. */
  readonly data = input<readonly T[] | null>(null);
  readonly columns = input.required<TableColumn<T>[]>();
  /** `fields=` — campos a pedir ao backend; vazio = conjunto padrão do backend. Só no modo `entityName`. */
  readonly fields = input<string>('');
  /** RQL — filtro base/atual, resolvido pelo pai (ex.: busca + `ativo eq true`). Só no modo `entityName`. */
  readonly filter = input<string>('');
  /** Ordenação padrão (`campo` ou `-campo`) enviada ao servidor. Só no modo `entityName`. */
  readonly sort = input<string>('');
  /** Só no modo `entityName` — tamanho de página pedido ao servidor. */
  readonly size = input<number>(10);
  /** Habilita clicar no cabeçalho pra ordenar — nos dois modos (no modo `data`, ordena no cliente). */
  readonly sortable = input<boolean>(false);
  /** Só no modo `data`: ordenação inicial, lida uma vez (ordenação no cliente, como o `DataTableComponent`). */
  readonly initialSort = input<TableSort | null>(null);
  readonly trackKey = input<string | null>(null);
  readonly emptyMessage = input<string>('Nenhum registro encontrado.');
  readonly rowClass = input<((row: T) => Record<string, boolean>) | null>(null);
  /** Só no modo `data`: tooltip customizado no hover da linha; `null`/vazio = sem tooltip nessa linha. */
  readonly rowTitle = input<((row: T) => string | null) | null>(null);
  /** Só no modo `data`: linhas para as quais isso retorna `true` sobem para o topo (ex.: favoritos resolvidos pelo pai). */
  readonly pinFirst = input<((row: T) => boolean) | null>(null);
  /** Só no modo `data`: coluna de ação fixa (ex.: favoritar) desenhada pela própria tabela, alternativa ao `favoritable` nativo (que exige `entityName`). */
  readonly pinAction = input<TablePinAction<T> | null>(null);

  readonly columnVisibility = input<boolean>(false);
  readonly columnsToolbar = input<boolean>(true);
  readonly defaultVisibleColumns = input<readonly string[] | null>(null);
  /** Chave de `localStorage` pra lembrar a escolha de colunas visíveis entre sessões; `null` = não persiste. */
  readonly columnsStorageKey = input<string | null>(null);
  /** Habilita arrastar o cabeçalho da coluna pra reordenar (persiste junto de `columnsStorageKey`). */
  readonly columnReorder = input<boolean>(false);
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
  /** Emitido a cada busca bem-sucedida — espelha `getCurrentDataList` do cev-front. Só no modo `entityName`. */
  readonly dataLoaded = output<T[]>();
  /**
   * Só no modo `data`: paginação já pronta, resolvida pelo pai (o binding no template é
   * `[pagination]`, igual `DataTableComponent` — o campo interno só se chama diferente porque
   * `pagination`, sem alias, já é o getter público de leitura usado nos dois modos).
   */
  readonly paginationInput = input<TablePagination | null>(null, { alias: 'pagination' });
  /** Só no modo `data`: página (0-based) pedida via Anterior/Próxima — quem busca é o pai. */
  readonly pageChange = output<number>();

  private readonly page = signal(0);
  private readonly sortOverride = signal<TableSort | null>(null);
  /** Público: o pai usa isso pra desenhar o próprio `<app-columns-menu>` (`columnsToolbar=false`). */
  readonly columnVisibilityState = new ColumnVisibilityController<T>(this.document, {
    columns: () => this.columns(),
    defaultVisibleColumns: () => this.defaultVisibleColumns(),
    storageKey: () => this.columnsStorageKey(),
  });

  private readonly rows = signal<T[]>([]);
  /** Só no modo `data`: spinner controlado pelo pai (igual `DataTableComponent`). */
  readonly loadingInput = input<boolean>(false, { alias: 'loading' });
  private readonly loadingState = signal(false);
  /** `loading` atual — no modo `entityName`, calculado sozinho durante o fetch; no modo `data`, reflete `[loading]`. */
  readonly loading = computed(() => (this.isExternalMode() ? this.loadingInput() : this.loadingState()));
  readonly loadError = signal(false);
  private readonly pageInfo = signal<TablePagination | null>(null);
  /** Paginação atual — no modo `entityName`, calculada sozinha; no modo `data`, reflete `[pagination]`. */
  readonly pagination = computed(() => (this.isExternalMode() ? this.paginationInput() : this.pageInfo()));
  /** Tooltip customizado atualmente exibido (linha sob o mouse), com posição em coordenadas de viewport. Só no modo `data`. */
  protected readonly hoveredTooltip = signal<{ text: string; top: number; left: number } | null>(null);

  /** entidadeId -> id da linha `Favorito` (precisa do id pra desfavoritar via DELETE). Só no modo `entityName`. */
  private readonly favoritoMap = signal<Map<number, number>>(new Map());
  private readonly favoritoBusy = signal<Set<number>>(new Set());
  /** Fichas completas de todos os favoritos do tipo de entidade — sempre fixos no topo. Só no modo `entityName`. */
  private readonly pinnedRows = signal<T[]>([]);

  protected readonly isExternalMode = computed(() => this.data() !== null);

  protected readonly visibleColumns = computed(() => {
    const ordered = this.columnVisibilityState.orderedColumns();
    if (!this.columnVisibility()) {
      return ordered;
    }
    return ordered.filter((column) => this.columnVisibilityState.isVisible(column.key));
  });

  protected readonly hasRowActions = computed(() => this.editAction() !== null || this.deleteAction() !== null);

  protected readonly hasPinColumn = computed(() => (this.isExternalMode() ? this.pinAction() !== null : this.favoritable()));

  protected readonly colspan = computed(
    () => this.visibleColumns().length + (this.hasPinColumn() ? 1 : 0) + (this.hasRowActions() ? 1 : 0),
  );

  protected readonly effectiveSort = computed(() => this.sortOverride() ?? this.initialSort());

  /**
   * Modo `data`: ordena localmente (igual `DataTableComponent.rows`) e sobe quem `pinFirst` marcar.
   * Modo `entityName`: favoritos fixos sempre primeiro, independente da paginação/ordenação do resto.
   */
  protected readonly displayRows = computed(() => {
    if (!this.isExternalMode()) {
      return [...this.pinnedRows(), ...this.rows()];
    }
    let rows = [...(this.data() ?? [])];
    const sort = this.effectiveSort();
    const pin = this.pinFirst();
    if (sort || pin) {
      const column = this.columns().find((item) => item.key === sort?.key);
      const direction = sort?.direction === 'desc' ? -1 : 1;
      rows = rows.sort((a, b) => {
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

  private lastQueryKey: string | null = null;
  private requestSeq = 0;

  constructor() {
    // Nunca dentro do `computed` de `visibleColumns` (ver `ColumnVisibilityController.carregarStorage`).
    effect(() => this.columnVisibilityState.carregarStorage());
    effect(() => this.columnVisibilityState.carregarOrdemStorage());

    effect(() => {
      if (this.isExternalMode()) {
        return; // modo `data` — quem busca é o pai.
      }
      const entityName = this.entityName();
      if (!entityName) {
        return;
      }
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

  /** Refaz a busca da página atual — o pai chama isso (via `viewChild`) depois de salvar/excluir. Sem efeito no modo `data`. */
  reload(): void {
    const entityName = this.entityName();
    if (this.isExternalMode() || !entityName) {
      return;
    }
    this.fetch(entityName, this.page(), this.currentSort(), this.filter(), this.fields(), this.size());
  }

  protected sortBy(key: string): void {
    const current = this.sortOverride();
    this.sortOverride.set(
      current?.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    );
  }

  protected onColumnDropped(event: CdkDragDrop<TableColumn<T>[]>): void {
    this.columnVisibilityState.reorder(event.previousIndex, event.currentIndex);
  }

  protected sortIcon(key: string): string {
    const sort = this.sortOverride();
    if (sort?.key !== key) {
      return 'fa-solid fa-sort';
    }
    return sort.direction === 'asc' ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down';
  }

  protected requestPage(delta: -1 | 1): void {
    const info = this.pagination();
    if (!info) {
      return;
    }
    const next = info.page + delta;
    if (next < 0 || (delta > 0 && info.last)) {
      return;
    }
    if (this.isExternalMode()) {
      this.pageChange.emit(next);
    } else {
      this.page.set(next);
    }
  }

  protected pageCountLabel(info: TablePagination): number {
    return Math.max(info.totalPages, 1);
  }

  protected onRowMouseEnter(event: MouseEvent, row: T): void {
    const text = this.rowTitle()?.(row);
    if (!text) {
      this.hoveredTooltip.set(null);
      return;
    }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.hoveredTooltip.set({ text, top: rect.bottom, left: rect.left });
  }

  protected onRowMouseLeave(): void {
    this.hoveredTooltip.set(null);
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
    const entityName = this.entityName();
    if (!entityName) {
      return; // favoritar nativo não existe no modo `data` — use `pinAction`.
    }
    const id = this.rowId(row);
    if (this.favoritoBusy().has(id) || !this.isRowFavoritable(row)) {
      return;
    }
    this.favoritoBusy.update((busy) => new Set(busy).add(id));
    const existingFavoritoId = this.favoritoMap().get(id);
    const request$ = existingFavoritoId != null
      ? this.domainFavoritoService.desfavoritar(existingFavoritoId).pipe(map(() => undefined))
      : this.domainFavoritoService.favoritar(entityName, id).pipe(map(() => undefined));

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

  /** Só usado pela ordenação local do modo `data` (ver `displayRows`) — igual `DataTableComponent`. */
  private compareValues(left: string, right: string): number {
    return left.localeCompare(right, 'pt-BR', { numeric: true, sensitivity: 'base' });
  }

  private fetch(entityName: string, page: number, sort: string, filter: string, fields: string, size: number): void {
    const seq = ++this.requestSeq;
    this.loadingState.set(true);
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
            this.loadingState.set(false);
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
        this.loadingState.set(false);
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
