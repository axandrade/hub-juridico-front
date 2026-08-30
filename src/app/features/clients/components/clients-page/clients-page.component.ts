import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { map, startWith } from 'rxjs';

import {
  CLIENT_HIRING_MODES,
  CLIENT_STATUSES,
  ClientHiringMode,
  ClientStatus,
  IClient,
  IRepresentanteLegal,
  TIPOS_PESSOA,
  TipoPessoa,
  contatoPrincipal,
  emailPrincipal,
  emptyDossier,
  emptyPessoa,
} from '../../../../core/models';
import { DataService } from '../../../../core/services/data.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import {
  ClientForm,
  createClientForm,
  patchClientForm,
  readClientForm,
} from '../../forms/client-form.factory';
import { ClientAdminFormComponent } from '../client-admin-form/client-admin-form.component';
import { ClientPersonFormComponent } from '../client-person-form/client-person-form.component';

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
type PanelTab = 'admin' | 'person' | 'records' | 'files';
type SortDirection = 'asc' | 'desc';
type NoticeKey =
  | 'selectOrCreate'
  | 'panelLocked'
  | 'panelUnlocked'
  | 'newClientStarted'
  | 'panelLockedSelection'
  | 'loaded'
  | 'saved'
  | 'selectToDelete'
  | 'confirmDelete'
  | 'deleted'
  | 'panelCleared'
  | 'filtersCleared'
  | 'fileSelected'
  | 'folderReady'
  | 'saveToCreateFolder'
  | 'fileReady'
  | 'noLinkedFile'
  | 'linkedProcesses'
  | 'selectForLinkedProcesses'
  | 'shareReady'
  | 'importReady'
  | 'naturalNameRequired'
  | 'legalNameRequired'
  | 'favoriteAdded'
  | 'favoriteRemoved';

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

interface ClientFileRow {
  name: string;
  kind: 'folder' | 'mainFile' | 'contract';
  updatedAt: string;
}

interface ClientNotice {
  key: NoticeKey;
  subject?: string;
}

@Component({
  selector: 'app-clients-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonComponent,
    ReactiveFormsModule,
    ClientPersonFormComponent,
    ClientAdminFormComponent,
  ],
  templateUrl: './clients-page.component.html',
  styleUrl: './clients-page.component.scss',
})
export class ClientsPageComponent {
  private readonly data = inject(DataService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly defaultUser = 'Lincoln';
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

  protected readonly form: ClientForm = createClientForm();
  private readonly formValue = toSignal(
    this.form.valueChanges.pipe(
      startWith(null),
      map(() => this.form.getRawValue()),
    ),
    { requireSync: true },
  );
  private readonly pessoaValue = computed(() => this.formValue().pessoa);

  protected readonly clients = signal<IClient[]>([]);
  protected readonly selectedId = signal<number | null>(null);
  protected readonly entityId = signal(0);
  protected readonly registeredAt = signal(new Date());
  protected readonly favorite = signal(false);
  protected readonly activeTableTab = signal<TipoPessoa>('FISICA');
  protected readonly activePanelTab = signal<PanelTab>('person');
  protected readonly panelVisible = signal(true);
  protected readonly panelLocked = signal(false);
  protected readonly showFilters = signal(false);
  protected readonly showColumns = signal(false);
  protected readonly showMoreActions = signal(false);
  protected readonly searchText = signal('');
  protected readonly fileSearch = signal('');
  protected readonly selectedFileName = signal('');
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
  protected readonly notice = signal<ClientNotice>({ key: 'selectOrCreate' });

  protected readonly statusOptions = CLIENT_STATUSES;
  protected readonly hiringModeOptions = CLIENT_HIRING_MODES;
  protected readonly tableTabs: readonly TipoPessoa[] = TIPOS_PESSOA;
  protected readonly panelTabs: readonly PanelTab[] = ['admin', 'person', 'records', 'files'];

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

  protected readonly tipoPessoaAtual = computed<TipoPessoa>(() => this.pessoaValue().tipo);

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

  protected readonly panelTitle = computed(() => {
    const pessoa = this.pessoaValue();
    return pessoa.tipo === 'FISICA'
      ? pessoa.nome.trim()
      : (pessoa.razaoSocial || pessoa.nomeFantasia).trim();
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

  protected readonly panelFiles = computed<ClientFileRow[]>(() => {
    const dossier = this.formValue().dossier;
    const registeredAt = this.registeredAt();
    const search = this.normalizeKey(this.fileSearch());
    const rows: ClientFileRow[] = [];

    if (dossier.folder) {
      rows.push({ name: dossier.folder, kind: 'folder', updatedAt: this.formatDate(registeredAt) });
    }

    if (dossier.file) {
      rows.push({ name: dossier.file, kind: 'mainFile', updatedAt: this.formatDate(registeredAt) });
    }

    if (dossier.contractNumber) {
      rows.push({
        name: dossier.contractNumber,
        kind: 'contract',
        updatedAt: dossier.contractDate || this.formatDate(registeredAt),
      });
    }

    return search
      ? rows.filter((row) => this.normalizeKey(`${row.name} ${row.kind}`).includes(search))
      : rows;
  });

  constructor() {
    this.data
      .getClients()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((clients) => {
        const cloned = clients.map((client) => this.cloneClient(client));
        this.clients.set(cloned);

        const firstClient =
          cloned.find((client) => client.pessoa.tipo === this.activeTableTab()) ?? cloned[0];

        if (firstClient) {
          this.selectClient(firstClient);
          return;
        }

        this.newRecord();
      });
  }

  protected setTableTab(tab: TipoPessoa): void {
    this.activeTableTab.set(tab);

    const firstClient = this.clients().find((client) => client.pessoa.tipo === tab);
    if (firstClient) {
      this.selectClient(firstClient);
      return;
    }

    this.newRecord(tab);
  }

  protected setPanelTab(tab: PanelTab): void {
    this.activePanelTab.set(tab);
  }

  protected togglePanel(): void {
    this.panelVisible.update((visible) => !visible);
  }

  protected togglePanelLock(): void {
    this.panelLocked.update((locked) => !locked);
    this.notice.set({ key: this.panelLocked() ? 'panelLocked' : 'panelUnlocked' });
  }

  protected toggleFavorite(): void {
    const next = !this.favorite();
    this.favorite.set(next);

    const id = this.entityId();
    if (!id) {
      return;
    }

    this.clients.update((clients) =>
      clients.map((client) => (client.id === id ? { ...client, favorite: next } : client)),
    );
  }

  protected toggleClientFavorite(client: IClient, event: MouseEvent): void {
    event.stopPropagation();
    const favorite = !client.favorite;

    this.clients.update((clients) =>
      clients.map((item) => (item.id === client.id ? { ...item, favorite } : item)),
    );

    if (this.entityId() === client.id) {
      this.favorite.set(favorite);
    }

    this.notice.set({
      key: favorite ? 'favoriteAdded' : 'favoriteRemoved',
      subject: this.clientDisplayName(client),
    });
  }

  protected newRecord(tipoPessoa: TipoPessoa = this.activeTableTab()): void {
    this.selectedId.set(null);
    this.loadIntoForm(this.createEmptyClient(tipoPessoa));
    this.panelVisible.set(true);
    this.activePanelTab.set('person');
    this.activeTableTab.set(tipoPessoa);
    this.notice.set({ key: 'newClientStarted' });
  }

  protected selectClient(client: IClient): void {
    if (this.panelLocked() && this.selectedId() !== client.id) {
      this.notice.set({ key: 'panelLockedSelection' });
      return;
    }

    this.selectedId.set(client.id);
    this.loadIntoForm(client);
    this.activePanelTab.set('person');
    this.panelVisible.set(true);
    this.notice.set({ key: 'loaded', subject: this.clientDisplayName(client) });
  }

  protected saveClient(event?: Event): void {
    event?.preventDefault();

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notice.set({
        key: this.tipoPessoaAtual() === 'JURIDICA' ? 'legalNameRequired' : 'naturalNameRequired',
      });
      this.activePanelTab.set('person');
      return;
    }

    const prepared = this.prepareClientForSave(this.assembleClient());
    const isExisting =
      prepared.id > 0 && this.clients().some((client) => client.id === prepared.id);
    const savedClient: IClient = {
      ...prepared,
      id: isExisting ? prepared.id : this.nextClientId(),
      registeredAt: isExisting ? prepared.registeredAt : new Date(),
    };

    this.clients.update((clients) =>
      isExisting
        ? clients.map((client) =>
            client.id === savedClient.id ? this.cloneClient(savedClient) : client,
          )
        : [this.cloneClient(savedClient), ...clients],
    );
    this.selectedId.set(savedClient.id);
    this.activeTableTab.set(savedClient.pessoa.tipo);
    this.activePanelTab.set('person');
    this.loadIntoForm(savedClient);
    this.notice.set({ key: 'saved', subject: this.clientDisplayName(savedClient) });
  }

  protected requestDeleteClient(): void {
    if (!this.selectedId()) {
      this.notice.set({ key: 'selectToDelete' });
      return;
    }

    this.notice.set({ key: 'confirmDelete', subject: this.panelTitle() });
  }

  protected deleteClient(): void {
    const selectedId = this.selectedId();
    if (!selectedId) {
      this.notice.set({ key: 'selectToDelete' });
      return;
    }

    this.clients.update((clients) => clients.filter((client) => client.id !== selectedId));
    this.newRecord(this.activeTableTab());
    this.notice.set({ key: 'deleted' });
  }

  protected clearPanel(): void {
    this.newRecord(this.activeTableTab());
    this.notice.set({ key: 'panelCleared' });
  }

  protected clearSearchAndFilters(): void {
    this.searchText.set('');
    this.filters.set({ status: '', hiringMode: '', internalOwner: '' });
    this.notice.set({ key: 'filtersCleared' });
  }

  protected updateSearch(event: Event): void {
    this.searchText.set((event.target as HTMLInputElement).value);
  }

  protected updateFileSearch(event: Event): void {
    this.fileSearch.set((event.target as HTMLInputElement).value);
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

  protected selectFile(row: ClientFileRow): void {
    this.selectedFileName.set(row.name);
    this.notice.set({ key: 'fileSelected', subject: row.name });
  }

  protected showFilesPanel(): void {
    this.panelVisible.set(true);
    this.activePanelTab.set('files');
    this.showMoreActions.set(false);
  }

  protected openFolder(): void {
    const folder = this.form.controls.dossier.controls.folder.value;
    this.notice.set({ key: folder ? 'folderReady' : 'saveToCreateFolder', subject: folder });
    this.showMoreActions.set(false);
  }

  protected openFile(): void {
    const file = this.form.controls.dossier.controls.file.value || this.selectedFileName();
    this.notice.set({ key: file ? 'fileReady' : 'noLinkedFile', subject: file });
    this.showMoreActions.set(false);
  }

  protected showLinkedProcesses(): void {
    const name = this.panelTitle();
    this.notice.set({
      key: name ? 'linkedProcesses' : 'selectForLinkedProcesses',
      subject: name,
    });
    this.showMoreActions.set(false);
  }

  protected shareBase(): void {
    this.notice.set({ key: 'shareReady' });
    this.showMoreActions.set(false);
  }

  protected importBase(): void {
    this.notice.set({ key: 'importReady' });
    this.showMoreActions.set(false);
  }

  protected configureFavorite(): void {
    this.toggleFavorite();
    this.showMoreActions.set(false);
  }

  protected formatClientId(id: number): string {
    return id.toString().padStart(6, '0');
  }

  private loadIntoForm(client: IClient): void {
    this.entityId.set(client.id);
    this.registeredAt.set(new Date(client.registeredAt));
    this.favorite.set(client.favorite);
    patchClientForm(this.form, client);
  }

  private assembleClient(): IClient {
    return {
      ...readClientForm(this.form),
      id: this.entityId(),
      registeredAt: this.registeredAt(),
      favorite: this.favorite(),
    };
  }

  private prepareClientForSave(client: IClient): IClient {
    const base = this.cloneClient(client);

    base.pessoa.nome = this.toUppercaseName(base.pessoa.nome);
    base.pessoa.razaoSocial = this.toUppercaseName(base.pessoa.razaoSocial);
    base.pessoa.nomeFantasia = this.toUppercaseName(base.pessoa.nomeFantasia);
    base.pessoa.representantes = base.pessoa.representantes.map(
      (representante): IRepresentanteLegal => ({
        ...representante,
        nome: this.toUppercaseName(representante.nome),
      }),
    );

    const dossier = base.dossier;
    dossier.status = dossier.status || 'active';
    dossier.registeredBy = dossier.registeredBy.trim() || this.defaultUser;
    dossier.internalOwner = dossier.internalOwner.trim() || this.defaultUser;

    if (!dossier.folder.trim()) {
      dossier.folder = this.clientFolderName(base);
    }

    const progress = dossier.progressEntry.trim();
    if (progress) {
      const historyLine = `${this.formatDateTime(new Date())} | ${progress}`;
      dossier.progressHistory = [dossier.progressHistory.trim(), historyLine]
        .filter(Boolean)
        .join('\n');
      dossier.progressEntry = '';
    }

    return base;
  }

  private createEmptyClient(tipoPessoa: TipoPessoa): IClient {
    return {
      id: 0,
      registeredAt: new Date(),
      favorite: false,
      pessoa: emptyPessoa(tipoPessoa),
      dossier: {
        ...emptyDossier(),
        registeredBy: this.defaultUser,
        internalOwner: this.defaultUser,
      },
    };
  }

  private cloneClient(client: IClient): IClient {
    return structuredClone(client);
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

  private nextClientId(): number {
    return this.clients().reduce((next, client) => Math.max(next, client.id + 1), 1);
  }

  private clientFolderName(client: IClient): string {
    const name = this.sanitizeFolderName(this.clientDisplayName(client) || 'CLIENTE');
    return `Pasta - ${this.formatClientId(client.id || this.nextClientId())} - ${name}`;
  }

  private sanitizeFolderName(value: string): string {
    return this.toUppercaseName(value)
      .replace(/[\\/:*?"<>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private toUppercaseName(value: string): string {
    return value.trim().toLocaleUpperCase('pt-BR');
  }

  private formatDate(date: Date): string {
    return new Intl.DateTimeFormat('pt-BR').format(date);
  }

  private formatDateTime(date: Date): string {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  private normalizeKey(value: string): string {
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }
}
