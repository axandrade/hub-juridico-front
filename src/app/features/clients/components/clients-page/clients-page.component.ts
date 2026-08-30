import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import {
  CLIENT_HIRING_MODES,
  CLIENT_STATUSES,
  ClientHiringMode,
  ClientStatus,
  IClient,
  TIPOS_PESSOA,
  TipoPessoa,
  contatoPrincipal,
  emailPrincipal,
} from '../../../../core/models';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ClientStore } from '../../services/client-store';
import { PessoaFormComponent } from '../pessoa-form/pessoa-form.component';

type ClientColumnKey =
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
type PageNotice = '' | 'filtersCleared' | 'shareReady' | 'importReady';

interface ClientColumn {
  key: ClientColumnKey;
  width: string;
  align?: 'center';
  getter: (client: IClient) => string;
}

interface ClientFilters {
  status: ClientStatus | '';
  hiringMode: ClientHiringMode | '';
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
  private readonly store = inject(ClientStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly defaultVisibleColumns: readonly ClientColumnKey[] = [
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
  protected readonly activeTableTab = signal<TipoPessoa>('FISICA');
  protected readonly panelVisible = signal(true);
  protected readonly showFilters = signal(false);
  protected readonly showColumns = signal(false);
  protected readonly showMoreActions = signal(false);
  protected readonly searchText = signal('');
  protected readonly sortColumn = signal<ClientColumnKey>('folder');
  protected readonly sortDirection = signal<SortDirection>('asc');
  protected readonly visibleColumnKeys = signal<ReadonlySet<ClientColumnKey>>(
    new Set(this.defaultVisibleColumns),
  );
  protected readonly filters = signal<ClientFilters>({
    status: '',
    hiringMode: '',
    internalOwner: '',
  });
  protected readonly pageNotice = signal<PageNotice>('');

  protected readonly statusOptions = CLIENT_STATUSES;
  protected readonly hiringModeOptions = CLIENT_HIRING_MODES;
  protected readonly tableTabs: readonly TipoPessoa[] = TIPOS_PESSOA;

  protected readonly clientColumns: readonly ClientColumn[] = [
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

  protected readonly filteredClients = computed(() => {
    const activeTab = this.activeTableTab();
    const filters = this.filters();
    const searchTerms = this.parseSearchTerms(this.searchText());

    return this.clients().filter((client) => {
      if (client.pessoa.tipo !== activeTab) {
        return false;
      }

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

  protected readonly summary = computed(() => {
    const clients = this.clients();
    return {
      total: clients.length,
      natural: clients.filter((client) => client.pessoa.tipo === 'FISICA').length,
      legal: clients.filter((client) => client.pessoa.tipo === 'JURIDICA').length,
      active: clients.filter((client) => client.dossier.status === 'active').length,
    };
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

  protected readonly tableStatus = computed(() => ({
    visible: this.displayedClients().length,
    filtered: this.filteredClients().length,
    total: this.clients().length,
  }));

  constructor() {
    this.store
      .carregarLista()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((clients) => {
        const firstOfTab = clients.find((client) => client.pessoa.tipo === this.activeTableTab());
        this.selectedPersonId.set(firstOfTab?.id ?? clients[0]?.id ?? null);
      });
  }

  protected setTableTab(tab: TipoPessoa): void {
    this.activeTableTab.set(tab);
    const firstOfTab = this.clients().find((client) => client.pessoa.tipo === tab);
    this.selectClient(firstOfTab ?? null);
  }

  protected togglePanel(): void {
    this.panelVisible.update((visible) => !visible);
  }

  protected toggleClientFavorite(client: IClient, event: MouseEvent): void {
    event.stopPropagation();
    this.store.alternarFavorito(client.id);
  }

  protected newRecord(): void {
    this.selectedPersonId.set(null);
    this.panelVisible.set(true);
  }

  protected selectClient(client: IClient | null): void {
    const id = client?.id ?? null;

    const editor = this.editor();
    if (editor?.locked() && this.selectedPersonId() !== id) {
      editor.notifyLockedSelection();
      return;
    }

    this.selectedPersonId.set(id);
    this.panelVisible.set(true);
  }

  protected onSaved(client: IClient): void {
    this.selectedPersonId.set(client.id);
    this.activeTableTab.set(client.pessoa.tipo);
  }

  protected onRemovedOrCleared(): void {
    this.selectedPersonId.set(null);
  }

  protected clearSearchAndFilters(): void {
    this.searchText.set('');
    this.filters.set({ status: '', hiringMode: '', internalOwner: '' });
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
    this.searchText.set((event.target as HTMLInputElement).value);
  }

  protected updateFilter(field: keyof ClientFilters, event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLSelectElement).value;

    this.filters.update((filters) => {
      switch (field) {
        case 'status':
          return { ...filters, status: value as ClientStatus | '' };
        case 'hiringMode':
          return { ...filters, hiringMode: value as ClientHiringMode | '' };
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

  protected toggleColumn(column: ClientColumnKey): void {
    const next = new Set(this.visibleColumnKeys());

    if (next.has(column) && next.size > 1) {
      next.delete(column);
    } else {
      next.add(column);
    }

    this.visibleColumnKeys.set(next);
  }

  protected isColumnVisible(column: ClientColumnKey): boolean {
    return this.visibleColumnKeys().has(column);
  }

  protected sortBy(column: ClientColumnKey): void {
    if (this.sortColumn() === column) {
      this.sortDirection.update((direction) => (direction === 'asc' ? 'desc' : 'asc'));
      return;
    }

    this.sortColumn.set(column);
    this.sortDirection.set('asc');
  }

  protected sortIcon(column: ClientColumnKey): string {
    if (this.sortColumn() !== column) {
      return 'fa-solid fa-sort';
    }

    return this.sortDirection() === 'asc' ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down';
  }

  protected displayCellValue(client: IClient, column: ClientColumn): string {
    const value = column.getter(client);
    return value || '-';
  }

  protected rowStatusClass(client: IClient): string {
    return `clients-table__status clients-table__status--${client.dossier.status}`;
  }

  protected columnClass(column: ClientColumn): string {
    return column.align === 'center' ? 'is-center' : '';
  }

  private parseSearchTerms(value: string): string[] {
    const matches = value.match(/"[^"]+"|\S+/g) ?? [];
    return matches.map((term) => term.replace(/^"|"$/g, '')).filter(Boolean);
  }

  private searchableClientText(client: IClient): string {
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

  private clientDisplayName(client: IClient): string {
    return client.pessoa.tipo === 'FISICA'
      ? client.pessoa.nome.trim()
      : (client.pessoa.razaoSocial || client.pessoa.nomeFantasia).trim();
  }

  private normalizeKey(value: string): string {
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }
}
