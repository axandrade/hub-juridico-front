import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, distinctUntilChanged, switchMap } from 'rxjs';

import {
  MODALIDADES_CLIENTE,
  STATUS_CLIENTE,
  ModalidadeCliente,
  StatusCliente,
  IPessoa,
  TipoPessoa,
  contatoPrincipal,
  emailPrincipal,
} from '../../../../core/models';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { PessoaStore } from '../../services/pessoa-store';
import { PessoaFormComponent } from '../pessoa-form/pessoa-form.component';

/** Aba da tabela: 'ALL' (padrão) mostra PF e PJ juntos. */
type TableTab = TipoPessoa | 'ALL';

type ColunaTabelaKey =
  | 'personType'
  | 'name'
  | 'document'
  | 'email'
  | 'phone'
  | 'status'
  | 'folder'
  | 'file'
  | 'registeredBy'
  | 'hiringMode'
  | 'internalOwner';
type SortDirection = 'asc' | 'desc';
type PageNotice = '' | 'filtersCleared' | 'shareReady' | 'importReady' | 'loadError';

interface ColunaTabela {
  key: ColunaTabelaKey;
  width: string;
  align?: 'center';
  getter: (client: IPessoa) => string;
}

interface FiltrosTabela {
  status: StatusCliente | '';
  hiringMode: ModalidadeCliente | '';
  internalOwner: string;
}

@Component({
  selector: 'app-clients-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, PessoaFormComponent],
  templateUrl: './clients-page.component.html',
  styleUrl: './clients-page.component.scss',
})
export class ClientsPageComponent {
  private readonly store = inject(PessoaStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly defaultVisibleColumns: readonly ColunaTabelaKey[] = [
    'personType',
    'name',
    'document',
    'email',
    'phone',
    'status',
    'folder',
    'file',
    'registeredBy',
  ];

  private readonly editor = viewChild(PessoaFormComponent);

  protected readonly clients = this.store.clients;
  protected readonly selectedPersonId = signal<number | null>(null);
  protected readonly activeTableTab = signal<TableTab>('ALL');
  /** Página pedida ao backend (0-based). */
  protected readonly pageIndex = signal(0);
  /** Bumpado para forçar um recarregamento com os mesmos filtros. */
  private readonly refreshTick = signal(0);
  protected readonly panelVisible = signal(true);
  protected readonly showFilters = signal(false);
  protected readonly showColumns = signal(false);
  protected readonly showMoreActions = signal(false);
  protected readonly searchText = signal('');
  protected readonly sortColumn = signal<ColunaTabelaKey>('folder');
  protected readonly sortDirection = signal<SortDirection>('asc');
  protected readonly visibleColumnKeys = signal<ReadonlySet<ColunaTabelaKey>>(
    new Set(this.defaultVisibleColumns),
  );
  protected readonly filters = signal<FiltrosTabela>({
    status: '',
    hiringMode: '',
    internalOwner: '',
  });
  protected readonly pageNotice = signal<PageNotice>('');

  protected readonly statusOptions = STATUS_CLIENTE;
  protected readonly hiringModeOptions = MODALIDADES_CLIENTE;
  protected readonly tableTabs: readonly TableTab[] = ['ALL', 'FISICA', 'JURIDICA'];

  /** Total de clientes do filtro atual (base inteira quando sem filtro de tipo/busca). */
  protected readonly totalClients = this.store.totalElements;
  /** Página atual exibida (1-based, para leitura humana). */
  protected readonly currentPageLabel = computed(() => this.store.page() + 1);
  /** Quantidade de páginas do filtro atual (mínimo 1). */
  protected readonly pageCount = computed(() => Math.max(this.store.totalPages(), 1));
  protected readonly canGoPrev = computed(() => this.store.page() > 0);
  protected readonly canGoNext = computed(() => !this.store.last());

  /** Tipo enviado ao backend: `null` na aba "Todos". */
  private readonly tipoFilter = computed<TipoPessoa | null>(() => {
    const tab = this.activeTableTab();
    return tab === 'ALL' ? null : tab;
  });

  /** Natureza de um cadastro novo — na aba "Todos" começa como física. */
  protected readonly novoTipoPadrao = computed<TipoPessoa>(() => {
    const tab = this.activeTableTab();
    return tab === 'ALL' ? 'FISICA' : tab;
  });

  protected readonly clientColumns: readonly ColunaTabela[] = [
    { key: 'personType', width: '138px', getter: (client) => client.pessoa.tipo },
    { key: 'name', width: '240px', getter: (client) => this.clientDisplayName(client) },
    {
      key: 'document',
      width: '170px',
      getter: (client) =>
        client.pessoa.tipo === 'FISICA' ? client.pessoa.cpf : client.pessoa.cnpj,
    },
    { key: 'email', width: '230px', getter: (client) => emailPrincipal(client.pessoa.emails) },
    { key: 'phone', width: '160px', getter: (client) => contatoPrincipal(client.pessoa.contatos) },
    { key: 'status', width: '110px', align: 'center', getter: (client) => client.dossier.status },
    { key: 'folder', width: '260px', getter: (client) => client.dossier.folder },
    { key: 'file', width: '180px', getter: (client) => client.dossier.file },
    { key: 'registeredBy', width: '150px', getter: (client) => client.dossier.registeredBy },
    { key: 'hiringMode', width: '150px', getter: (client) => client.dossier.hiringMode },
    { key: 'internalOwner', width: '160px', getter: (client) => client.dossier.internalOwner },
  ];

  protected readonly displayedColumns = computed(() => {
    const visible = this.visibleColumnKeys();
    return this.clientColumns.filter((column) => visible.has(column.key));
  });

  /**
   * Só `tipo` é resolvido no backend. Busca, status, modalidade e responsável
   * refinam localmente a página carregada (10 linhas) — o endpoint ainda não
   * tem esses filtros.
   */
  protected readonly filteredClients = computed(() => {
    const filters = this.filters();
    const searchTerms = this.parseSearchTerms(this.searchText());

    return this.clients().filter((client) => {
      if (filters.status && client.dossier.status !== filters.status) {
        return false;
      }

      if (filters.hiringMode && client.dossier.hiringMode !== filters.hiringMode) {
        return false;
      }

      if (
        filters.internalOwner.trim() &&
        !this.normalizeKey(client.dossier.internalOwner).includes(
          this.normalizeKey(filters.internalOwner),
        )
      ) {
        return false;
      }

      if (!searchTerms.length) {
        return true;
      }

      const searchable = this.searchableClientText(client);
      return searchTerms.every((term) => searchable.includes(this.normalizeKey(term)));
    });
  });

  protected readonly displayedClients = computed(() => {
    const column = this.clientColumns.find((item) => item.key === this.sortColumn());
    const direction = this.sortDirection() === 'asc' ? 1 : -1;

    return [...this.filteredClients()].sort((a, b) => {
      if (a.favorite !== b.favorite) {
        return a.favorite ? -1 : 1;
      }

      if (!column) {
        return this.clientDisplayName(a).localeCompare(this.clientDisplayName(b), 'pt-BR');
      }

      return this.compareColumnValues(column.getter(a), column.getter(b)) * direction;
    });
  });

  protected readonly activeFilterCount = computed(
    () =>
      [
        this.filters().status,
        this.filters().hiringMode,
        this.filters().internalOwner.trim(),
        this.searchText().trim(),
      ].filter(Boolean).length,
  );

  constructor() {
    // Uma requisição por combinação de página + tipo (únicos filtros do endpoint).
    // `refreshTick` força recarregar após salvar/apagar.
    const query = computed(() => ({
      page: this.pageIndex(),
      tipo: this.tipoFilter(),
      tick: this.refreshTick(),
    }));

    toObservable(query)
      .pipe(
        distinctUntilChanged(
          (a, b) => a.page === b.page && a.tipo === b.tipo && a.tick === b.tick,
        ),
        switchMap(({ page, tipo }) =>
          this.store.carregar({ page, tipo }).pipe(
            catchError(() => {
              this.pageNotice.set('loadError');
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        if (this.pageNotice() === 'loadError') {
          this.pageNotice.set('');
        }
      });
  }

  protected reloadList(): void {
    this.refreshTick.update((tick) => tick + 1);
  }

  protected setTableTab(tab: TableTab): void {
    if (this.activeTableTab() === tab) {
      return;
    }
    this.activeTableTab.set(tab);
    this.pageIndex.set(0);
  }

  protected goToPage(delta: number): void {
    const next = this.pageIndex() + delta;
    if (next < 0 || next >= this.pageCount()) {
      return;
    }
    this.pageIndex.set(next);
  }

  protected togglePanel(): void {
    this.panelVisible.update((visible) => !visible);
  }

  protected toggleClientFavorite(client: IPessoa, event: MouseEvent): void {
    event.stopPropagation();
    this.store.alternarFavorito(client.id);
  }

  protected newRecord(): void {
    this.selectedPersonId.set(null);
    this.panelVisible.set(true);
  }

  protected selectClient(client: IPessoa | null): void {
    const id = client?.id ?? null;

    const editor = this.editor();
    if (editor?.locked() && this.selectedPersonId() !== id) {
      editor.notifyLockedSelection();
      return;
    }

    this.selectedPersonId.set(id);
    this.panelVisible.set(true);
  }

  /**
   * Clique em qualquer lugar do documento fora de uma linha da tabela e fora do
   * painel desmarca o cliente e limpa a ficha — a não ser que o cadeado esteja
   * travado (aí a ficha selecionada permanece).
   */
  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (this.selectedPersonId() === null || this.editor()?.locked()) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (!target || target.closest('tr, app-pessoa-form')) {
      return;
    }
    this.selectedPersonId.set(null);
  }

  protected onSaved(client: IPessoa): void {
    this.selectedPersonId.set(client.id);
    if (this.activeTableTab() !== 'ALL' && this.activeTableTab() !== client.pessoa.tipo) {
      this.activeTableTab.set(client.pessoa.tipo);
    }
    this.pageIndex.set(0);
    this.reloadList();
  }

  protected onRemovedOrCleared(): void {
    this.selectedPersonId.set(null);
    this.reloadList();
  }

  protected clearSearchAndFilters(): void {
    this.searchText.set('');
    this.filters.set({ status: '', hiringMode: '', internalOwner: '' });
    this.pageIndex.set(0);
    this.pageNotice.set('filtersCleared');
    this.showMoreActions.set(false);
  }

  protected shareBase(): void {
    this.pageNotice.set('shareReady');
    this.showMoreActions.set(false);
  }

  protected importBase(): void {
    this.pageNotice.set('importReady');
    this.showMoreActions.set(false);
  }

  protected updateSearch(event: Event): void {
    // Busca é client-side (só a página carregada) — não reinicia a paginação.
    this.searchText.set((event.target as HTMLInputElement).value);
  }

  protected updateFilter(field: keyof FiltrosTabela, event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLSelectElement).value;

    this.filters.update((filters) => {
      switch (field) {
        case 'status':
          return { ...filters, status: value as StatusCliente | '' };
        case 'hiringMode':
          return { ...filters, hiringMode: value as ModalidadeCliente | '' };
        case 'internalOwner':
          return { ...filters, internalOwner: value };
      }
    });
  }

  protected toggleFilters(): void {
    this.showFilters.update((visible) => !visible);
    this.showColumns.set(false);
    this.showMoreActions.set(false);
  }

  protected toggleColumns(): void {
    this.showColumns.update((visible) => !visible);
    this.showFilters.set(false);
    this.showMoreActions.set(false);
  }

  protected toggleMoreActions(): void {
    this.showMoreActions.update((visible) => !visible);
    this.showColumns.set(false);
    this.showFilters.set(false);
  }

  protected toggleColumn(column: ColunaTabelaKey): void {
    const next = new Set(this.visibleColumnKeys());

    if (next.has(column) && next.size > 1) {
      next.delete(column);
    } else {
      next.add(column);
    }

    this.visibleColumnKeys.set(next);
  }

  protected isColumnVisible(column: ColunaTabelaKey): boolean {
    return this.visibleColumnKeys().has(column);
  }

  protected sortBy(column: ColunaTabelaKey): void {
    if (this.sortColumn() === column) {
      this.sortDirection.update((direction) => (direction === 'asc' ? 'desc' : 'asc'));
      return;
    }

    this.sortColumn.set(column);
    this.sortDirection.set('asc');
  }

  protected sortIcon(column: ColunaTabelaKey): string {
    if (this.sortColumn() !== column) {
      return 'fa-solid fa-sort';
    }

    return this.sortDirection() === 'asc' ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down';
  }

  protected displayCellValue(client: IPessoa, column: ColunaTabela): string {
    const value = column.getter(client);
    return value || '-';
  }

  protected rowStatusClass(client: IPessoa): string {
    return `clients-table__status clients-table__status--${client.dossier.status}`;
  }

  protected columnClass(column: ColunaTabela): string {
    return column.align === 'center' ? 'is-center' : '';
  }

  private parseSearchTerms(value: string): string[] {
    const matches = value.match(/"[^"]+"|\S+/g) ?? [];
    return matches.map((term) => term.replace(/^"|"$/g, '')).filter(Boolean);
  }

  private searchableClientText(client: IPessoa): string {
    return this.normalizeKey(
      [
        client.pessoa.tipo,
        client.pessoa.nome,
        client.pessoa.cpf,
        client.pessoa.razaoSocial,
        client.pessoa.nomeFantasia,
        client.pessoa.cnpj,
        emailPrincipal(client.pessoa.emails),
        contatoPrincipal(client.pessoa.contatos),
        client.dossier.status,
        client.dossier.folder,
        client.dossier.file,
        client.dossier.registeredBy,
        client.dossier.internalOwner,
        client.dossier.hiringMode,
      ].join(' '),
    );
  }

  private compareColumnValues(left: string, right: string): number {
    return left.localeCompare(right, 'pt-BR', { numeric: true, sensitivity: 'base' });
  }

  private clientDisplayName(client: IPessoa): string {
    return client.pessoa.tipo === 'FISICA'
      ? client.pessoa.nome.trim()
      : (client.pessoa.razaoSocial || client.pessoa.nomeFantasia).trim();
  }

  private normalizeKey(value: string): string {
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }
}
