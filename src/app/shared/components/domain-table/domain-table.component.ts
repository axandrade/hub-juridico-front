import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, switchMap } from 'rxjs';

import { DomainQueryService } from '../../../core/services/domain-query.service';
import { DataTableComponent } from '../table/data-table.component';
import { TableColumn } from '../table/table-column.model';
import { TablePagination, TablePinAction, TableSort } from '../table/table.model';

export type DomainRow = Record<string, unknown>;

/** Mesma conversão do backend (`RecordFieldNames.toSnakeCase`) — sem acrônimos, um regex simples basta. */
function toSnakeCase(field: string): string {
  return field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function parseFieldList(raw: string): string[] {
  return raw
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean);
}

/** `'` dentro do valor vira `''` — mesmo escape que o parser do backend desfaz. */
function escapeFilterValue(valor: string): string {
  return valor.replace(/'/g, "''");
}

/**
 * Fachada sobre o `app-data-table`: declara `entityName` + `fields` (no padrão do campo da
 * entidade, ex.: `dataGeracao` — o backend traduz pra snake_case sozinho) e a tabela busca
 * sozinha, paginada, contra o endpoint genérico `DomainQueryService`/`DomainQueryController`.
 *
 * ```html
 * <app-domain-table entityName="pessoa" fields="nome,cpf,tipo" />
 * ```
 *
 * Uma coluna é gerada automaticamente por campo de `fields`. O JSON de resposta vem em
 * snake_case (`estado_civil`, não `estadoCivil`) — é essa forma snake_case que vira a `key` da
 * coluna, e é por ela que `headers`/`columnOverrides`/`trackKey`/`initialSort` devem referenciar
 * o campo (só o próprio `fields` usa o padrão camelCase da entidade, porque é o que o backend
 * espera na requisição). Pra formatação por coluna (badge, data, moeda, `formatter` customizado,
 * `align`/`width`) ou pra qualquer recurso "rico" do `app-data-table` (ordenação, visibilidade de
 * colunas, busca/filtro client-side, pin de linha, classes de linha), passe
 * `columnOverrides`/os inputs correspondentes — todos repassados direto pro `app-data-table` por
 * baixo. Um `formatter`/`rowClass`/etc. recebe a linha inteira (`DomainRow`), então pode combinar
 * campos que não têm coluna própria (ex.: mostrar `cpf` ou `cnpj` conforme `row['tipo']`), desde
 * que o campo esteja em `fields`.
 *
 * <p>Limite importante: {@code DomainListSource}/{@code DomainQueryController} só paginam e
 * selecionam campos — não há como passar filtro nenhum (tipo, status, busca por documento etc.)
 * pro backend por esse endpoint. Pra telas que precisam de filtro server-side sobre a base
 * inteira (não só a página carregada), use um store dedicado com `app-data-table` direto.
 *
 * <p>Pra telas com um store próprio que precisa ficar em dia com o que foi carregado (mutações,
 * `buscar` por id etc.), use `#template-ref` + `(pageLoaded)` pra alimentar o store a cada página,
 * e `refresh()`/`goToFirstPage()` (via a mesma ref) pra forçar recarregar depois de salvar/apagar.
 *
 * <p>Filtro por coluna (`column.filter` em `columnOverrides`) já manda `filter=` de verdade pro
 * backend — texto vira `ilike`, select vira `eq`. Volta pra página 0 a cada mudança.
 */
@Component({
  selector: 'app-domain-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTableComponent],
  templateUrl: './domain-table.component.html',
  styleUrl: './domain-table.component.scss',
})
export class DomainTableComponent {
  private readonly domainQuery = inject(DomainQueryService);
  private readonly destroyRef = inject(DestroyRef);

  readonly entityName = input.required<string>();
  /** Campos separados por vírgula, no padrão do campo da entidade (ex.: `"nome,cpf,dataGeracao"`). */
  readonly fields = input.required<string>();
  /**
   * Subconjunto de `fields` (mesmo padrão camelCase) que de fato vira coluna; por padrão, todos.
   * Use isso quando parte de `fields` só alimenta o `formatter` de outra coluna sem merecer coluna
   * própria (ex.: pedir `cnpj` só pra um `formatter` de `cpf` escolher qual mostrar).
   */
  readonly columnFields = input<string | null>(null);
  /** Rótulo de cabeçalho por campo (chave em snake_case, ex.: `estado_civil`); sem entrada, usa a key crua. */
  readonly headers = input<Record<string, string> | null>(null);
  /**
   * Ajustes por campo (chave em snake_case, mesclados sobre a coluna gerada automaticamente):
   * `format`, `formatter`, `badgeTone`, `badgeDot`, `align`, `width`. `header`/`key` do override
   * são ignorados — use `headers` pro rótulo.
   */
  readonly columnOverrides = input<Record<string, Partial<TableColumn<DomainRow>>> | null>(null);
  readonly emptyMessage = input<string>('Nenhum registro encontrado.');
  readonly trackKey = input<string | null>(null);

  readonly rowClick = output<DomainRow>();
  /** Emitido a cada página recebida — pra quem precisa de um store próprio em dia (ex.: mutações). */
  readonly pageLoaded = output<DomainRow[]>();
  /** Emitido quando a busca falha (a tabela já esvazia sozinha; isso é só pra o pai avisar o usuário). */
  readonly loadError = output<void>();

  readonly sortable = input<boolean>(false);
  readonly initialSort = input<TableSort | null>(null);

  readonly columnVisibility = input<boolean>(false);
  readonly defaultVisibleColumns = input<readonly string[] | null>(null);

  /** Busca livre client-side (aplicada sobre a página carregada, não refaz requisição). */
  readonly searchQuery = input<string>('');
  readonly searchableText = input<((row: DomainRow) => string) | null>(null);

  readonly filterPredicate = input<((row: DomainRow) => boolean) | null>(null);
  readonly pinFirst = input<((row: DomainRow) => boolean) | null>(null);
  readonly rowClass = input<((row: DomainRow) => Record<string, boolean>) | null>(null);
  readonly pinAction = input<TablePinAction<DomainRow> | null>(null);

  private readonly page = signal(0);
  private readonly reloadTick = signal(0);
  private readonly items = signal<DomainRow[]>([]);
  private readonly loading = signal(false);
  private readonly pagination = signal<TablePagination | null>(null);
  /** Filtro por coluna ativo (chave = `column.key`, snake_case); vira `filter=` na busca. */
  private readonly columnFilters = signal<Record<string, string>>({});

  private readonly fieldList = computed(() => parseFieldList(this.fields()));
  private readonly columnFieldList = computed(() => {
    const raw = this.columnFields();
    return raw === null ? this.fieldList() : parseFieldList(raw);
  });

  protected readonly columns = computed<TableColumn<DomainRow>[]>(() => {
    const headerMap = this.headers();
    const overrides = this.columnOverrides();
    return this.columnFieldList().map((field) => {
      const key = toSnakeCase(field);
      return {
        key,
        header: headerMap?.[key] ?? key,
        ...overrides?.[key],
      };
    });
  });

  protected readonly rows = this.items.asReadonly();
  protected readonly isLoading = this.loading.asReadonly();
  protected readonly columnFilterValues = this.columnFilters.asReadonly();
  /** Pública pra quem tem um `#template-ref` desta tabela precisar do total (ex.: legenda "N registros"). */
  readonly currentPagination = this.pagination.asReadonly();

  /**
   * `column.filter.type` decide o operador: texto → `ilike`, select → `eq`. O campo enviado é
   * `column.filter.field` quando informado (coluna mesclada que filtra por outro nome no
   * backend), senão a própria `column.key`.
   */
  private readonly filterExpressions = computed(() => {
    const porChave = new Map(this.columns().map((column) => [column.key, column.filter]));
    return Object.entries(this.columnFilters())
      .filter(([, valor]) => valor.trim())
      .map(([chave, valor]) => {
        const filtro = porChave.get(chave);
        const campo = filtro?.field ?? chave;
        const operador = filtro?.type === 'select' ? 'eq' : 'ilike';
        return `${campo} ${operador} '${escapeFilterValue(valor.trim())}'`;
      });
  });

  constructor() {
    const query = computed(() => ({
      entity: this.entityName(),
      fields: this.fieldList(),
      page: this.page(),
      filter: this.filterExpressions(),
      tick: this.reloadTick(),
    }));

    toObservable(query)
      .pipe(
        switchMap(({ entity, fields, page, filter }) => {
          this.loading.set(true);
          return this.domainQuery.list<DomainRow>(entity, { page, fields, filter }).pipe(
            catchError(() => {
              this.items.set([]);
              this.loading.set(false);
              this.loadError.emit();
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        this.items.set(result.items);
        this.pagination.set({
          page: result.page,
          totalPages: result.totalPages,
          totalElements: result.totalElements,
          last: result.last,
        });
        this.loading.set(false);
        this.pageLoaded.emit(result.items);
      });
  }

  protected onPageChange(page: number): void {
    this.page.set(page);
  }

  /** Confirma (ou limpa, se `value` vazio) o filtro de uma coluna e volta pra página 0. */
  protected onColumnFilterChange({ key, value }: { key: string; value: string }): void {
    this.columnFilters.update((atual) => {
      if (!value.trim()) {
        const { [key]: _removido, ...resto } = atual;
        return resto;
      }
      return { ...atual, [key]: value };
    });
    this.page.set(0);
  }

  /** Refaz a busca da página atual (ex.: depois de salvar/apagar um registro). */
  refresh(): void {
    this.reloadTick.update((tick) => tick + 1);
  }

  /** Volta pra primeira página (ex.: depois de criar um registro novo). */
  goToFirstPage(): void {
    this.page.set(0);
  }
}
