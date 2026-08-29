import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import {
  BRAZILIAN_STATES,
  CLIENT_CITIES,
  CLIENT_HIRING_MODES,
  CLIENT_MARITAL_STATUSES,
  CLIENT_NATURES,
  CLIENT_STATUSES,
  ClientHiringMode,
  ClientNature,
  ClientStatus,
  IClient,
} from '../../../../core/models';
import { DataService } from '../../../../core/services/data.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';

type StringKeys<T> = {
  [K in keyof T]-?: T[K] extends string ? K : never;
}[keyof T];

type ClientStringField = StringKeys<IClient>;
type ClientListField =
  | 'additionalIndividualEmails'
  | 'additionalIndividualPhones'
  | 'additionalCompanyEmails'
  | 'additionalCompanyPhones'
  | 'additionalRepresentativeEmails'
  | 'additionalRepresentativePhones';
type ClientColumnKey =
  | 'legalNature'
  | 'individualName'
  | 'companyLegalName'
  | 'cpf'
  | 'cnpj'
  | 'individualEmail'
  | 'companyEmail'
  | 'individualWhatsapp'
  | 'companyWhatsapp'
  | 'status'
  | 'folder'
  | 'file'
  | 'registeredBy'
  | 'hiringMode'
  | 'internalOwner';
type PanelTab = ClientNature | 'admin' | 'records' | 'files';
type InputKind = 'text' | 'email' | 'tel' | 'select' | 'textarea' | 'readonly';
type SortDirection = 'asc' | 'desc';
type RepresentativeField = keyof RepresentativeDraft;
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
  | 'individualNameRequired'
  | 'companyNameRequired'
  | 'favoriteAdded'
  | 'favoriteRemoved';

interface ClientFieldConfig {
  key: ClientStringField;
  type?: InputKind;
  options?: readonly string[];
  rows?: number;
  span?: 'full';
}

interface ClientContactList {
  key: ClientListField;
  inputType: 'email' | 'tel';
}

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

interface RepresentativeDraft {
  name: string;
  cpf: string;
  role: string;
  email: string;
  phone: string;
}

@Component({
  selector: 'app-clients-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent],
  templateUrl: './clients-page.component.html',
  styleUrl: './clients-page.component.scss',
})
export class ClientsPageComponent {
  private readonly data = inject(DataService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly defaultUser = 'Lincoln';
  private readonly defaultVisibleColumns: readonly ClientColumnKey[] = [
    'legalNature',
    'individualName',
    'companyLegalName',
    'cpf',
    'cnpj',
    'individualEmail',
    'companyEmail',
    'individualWhatsapp',
    'companyWhatsapp',
    'status',
    'folder',
    'file',
    'registeredBy',
  ];
  private readonly uppercaseFields: readonly ClientStringField[] = [
    'individualName',
    'companyLegalName',
    'companyTradeName',
    'legalRepresentativeName',
  ];

  protected readonly clients = signal<IClient[]>([]);
  protected readonly selectedId = signal<number | null>(null);
  protected readonly draft = signal<IClient>(this.createEmptyClient('individual'));
  protected readonly activeTableTab = signal<ClientNature>('individual');
  protected readonly activePanelTab = signal<PanelTab>('individual');
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

  protected readonly natureOptions = CLIENT_NATURES;
  protected readonly statusOptions = CLIENT_STATUSES;
  protected readonly hiringModeOptions = CLIENT_HIRING_MODES;
  protected readonly maritalStatusOptions = CLIENT_MARITAL_STATUSES;
  protected readonly stateOptions = BRAZILIAN_STATES;
  protected readonly cityOptions = CLIENT_CITIES;
  protected readonly tableTabs: readonly ClientNature[] = CLIENT_NATURES;
  protected readonly panelTabs: readonly PanelTab[] = [
    'admin',
    'individual',
    'company',
    'records',
    'files',
  ];

  protected readonly clientColumns: readonly ClientColumn[] = [
    {
      key: 'legalNature',
      width: '148px',
      getter: (client) => client.legalNature,
    },
    { key: 'individualName', width: '210px', getter: (client) => client.individualName },
    {
      key: 'companyLegalName',
      width: '230px',
      getter: (client) => client.companyLegalName,
    },
    { key: 'cpf', width: '140px', getter: (client) => client.cpf },
    { key: 'cnpj', width: '160px', getter: (client) => client.cnpj },
    { key: 'individualEmail', width: '220px', getter: (client) => client.individualEmail },
    { key: 'companyEmail', width: '220px', getter: (client) => client.companyEmail },
    {
      key: 'individualWhatsapp',
      width: '150px',
      getter: (client) => client.individualWhatsapp,
    },
    {
      key: 'companyWhatsapp',
      width: '150px',
      getter: (client) => client.companyWhatsapp,
    },
    {
      key: 'status',
      width: '110px',
      align: 'center',
      getter: (client) => client.status,
    },
    { key: 'folder', width: '260px', getter: (client) => client.folder },
    { key: 'file', width: '180px', getter: (client) => client.file },
    {
      key: 'registeredBy',
      width: '145px',
      getter: (client) => client.registeredBy,
    },
    {
      key: 'hiringMode',
      width: '145px',
      getter: (client) => client.hiringMode,
    },
    {
      key: 'internalOwner',
      width: '155px',
      getter: (client) => client.internalOwner,
    },
  ];

  protected readonly individualFields: readonly (readonly ClientFieldConfig[])[] = [
    [{ key: 'individualName' }, { key: 'cpf' }],
    [
      { key: 'identityNumber' },
      { key: 'maritalStatus', type: 'select', options: this.maritalStatusOptions },
    ],
    [{ key: 'occupation' }, { key: 'nationality' }],
    [
      { key: 'individualEmail', type: 'email' },
      { key: 'individualWhatsapp', type: 'tel' },
    ],
    [{ key: 'individualStreet' }, { key: 'individualNumber' }],
    [{ key: 'individualComplement' }, { key: 'individualDistrict' }],
    [
      { key: 'individualState', type: 'select', options: this.stateOptions },
      { key: 'individualCity', type: 'select', options: this.cityOptions },
      { key: 'individualZipCode' },
    ],
    [{ key: 'individualNotes', type: 'textarea', rows: 3, span: 'full' }],
  ];

  protected readonly individualContactLists: readonly ClientContactList[] = [
    { key: 'additionalIndividualEmails', inputType: 'email' },
    { key: 'additionalIndividualPhones', inputType: 'tel' },
  ];

  protected readonly companyFields: readonly (readonly ClientFieldConfig[])[] = [
    [{ key: 'companyLegalName' }, { key: 'companyTradeName' }],
    [{ key: 'cnpj' }, { key: 'stateRegistration' }, { key: 'municipalRegistration' }],
    [
      { key: 'companyEmail', type: 'email' },
      { key: 'companyWhatsapp', type: 'tel' },
    ],
    [{ key: 'companyStreet' }, { key: 'companyNumber' }],
    [{ key: 'companyComplement' }, { key: 'companyDistrict' }],
    [
      { key: 'companyState', type: 'select', options: this.stateOptions },
      { key: 'companyCity', type: 'select', options: this.cityOptions },
      { key: 'companyZipCode' },
    ],
    [{ key: 'companyNotes', type: 'textarea', rows: 3, span: 'full' }],
  ];

  protected readonly companyContactLists: readonly ClientContactList[] = [
    { key: 'additionalCompanyEmails', inputType: 'email' },
    { key: 'additionalCompanyPhones', inputType: 'tel' },
  ];

  protected readonly representativeFields: readonly (readonly ClientFieldConfig[])[] = [
    [{ key: 'legalRepresentativeName' }, { key: 'legalRepresentativeCpf' }],
    [{ key: 'legalRepresentativeRole' }, { key: 'legalRepresentativeEmail', type: 'email' }],
    [{ key: 'legalRepresentativeWhatsapp', type: 'tel' }],
  ];

  protected readonly representativeContactLists: readonly ClientContactList[] = [
    { key: 'additionalRepresentativeEmails', inputType: 'email' },
    { key: 'additionalRepresentativePhones', inputType: 'tel' },
  ];

  protected readonly adminFields: readonly (readonly ClientFieldConfig[])[] = [
    [
      { key: 'status', type: 'select', options: this.statusOptions },
      { key: 'hiringMode', type: 'select', options: this.hiringModeOptions },
    ],
    [{ key: 'folder', type: 'readonly' }, { key: 'file' }],
    [{ key: 'registeredBy', type: 'readonly' }, { key: 'contractNumber' }, { key: 'contractDate' }],
    [{ key: 'referredBy' }, { key: 'internalOwner' }],
    [{ key: 'notes', type: 'textarea', rows: 4, span: 'full' }],
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
      if (client.legalNature !== activeTab) {
        return false;
      }

      if (filters.status && client.status !== filters.status) {
        return false;
      }

      if (filters.hiringMode && client.hiringMode !== filters.hiringMode) {
        return false;
      }

      if (
        filters.internalOwner.trim() &&
        !this.normalizeKey(client.internalOwner).includes(this.normalizeKey(filters.internalOwner))
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

  protected readonly selectedClient = computed(() => {
    const selectedId = this.selectedId();
    return selectedId ? (this.clients().find((client) => client.id === selectedId) ?? null) : null;
  });

  protected readonly summary = computed(() => {
    const clients = this.clients();
    return {
      total: clients.length,
      individual: clients.filter((client) => client.legalNature === 'individual').length,
      company: clients.filter((client) => client.legalNature === 'company').length,
      active: clients.filter((client) => client.status === 'active').length,
    };
  });

  protected readonly panelTitle = computed(() => this.clientDisplayName(this.draft()));

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
    const draft = this.draft();
    const search = this.normalizeKey(this.fileSearch());
    const rows: ClientFileRow[] = [];

    if (draft.folder) {
      rows.push({
        name: draft.folder,
        kind: 'folder',
        updatedAt: this.formatDate(draft.registeredAt),
      });
    }

    if (draft.file) {
      rows.push({
        name: draft.file,
        kind: 'mainFile',
        updatedAt: this.formatDate(draft.registeredAt),
      });
    }

    if (draft.contractNumber) {
      rows.push({
        name: draft.contractNumber,
        kind: 'contract',
        updatedAt: draft.contractDate || this.formatDate(draft.registeredAt),
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
          cloned.find((client) => client.legalNature === this.activeTableTab()) ?? cloned[0];

        if (firstClient) {
          this.selectClient(firstClient);
          return;
        }

        this.newRecord();
      });
  }

  protected setTableTab(tab: ClientNature): void {
    this.activeTableTab.set(tab);

    const firstClient = this.clients().find((client) => client.legalNature === tab);
    if (firstClient) {
      this.selectClient(firstClient);
      return;
    }

    this.newRecord(tab);
  }

  protected setPanelTab(tab: PanelTab): void {
    this.activePanelTab.set(tab);

    if (this.isNature(tab)) {
      this.setNature(tab);
    }
  }

  protected togglePanel(): void {
    this.panelVisible.update((visible) => !visible);
  }

  protected togglePanelLock(): void {
    this.panelLocked.update((locked) => !locked);
    this.notice.set({ key: this.panelLocked() ? 'panelLocked' : 'panelUnlocked' });
  }

  protected toggleFavorite(): void {
    const id = this.draft().id;
    this.draft.update((draft) => ({ ...draft, favorite: !draft.favorite }));

    if (!id) {
      return;
    }

    this.clients.update((clients) =>
      clients.map((client) =>
        client.id === id ? { ...client, favorite: !client.favorite } : client,
      ),
    );
  }

  protected toggleClientFavorite(client: IClient, event: MouseEvent): void {
    event.stopPropagation();
    const favorite = !client.favorite;

    this.clients.update((clients) =>
      clients.map((item) => (item.id === client.id ? { ...item, favorite } : item)),
    );

    if (this.draft().id === client.id) {
      this.draft.update((draft) => ({ ...draft, favorite }));
    }

    this.notice.set({
      key: favorite ? 'favoriteAdded' : 'favoriteRemoved',
      subject: this.clientDisplayName(client),
    });
  }

  protected newRecord(nature: ClientNature = this.activeTableTab()): void {
    this.selectedId.set(null);
    this.panelVisible.set(true);
    this.activePanelTab.set(nature);
    this.activeTableTab.set(nature);
    this.draft.set(this.createEmptyClient(nature));
    this.notice.set({ key: 'newClientStarted' });
  }

  protected selectClient(client: IClient): void {
    if (this.panelLocked() && this.selectedId() !== client.id) {
      this.notice.set({ key: 'panelLockedSelection' });
      return;
    }

    this.selectedId.set(client.id);
    this.draft.set(this.cloneClient(client));
    this.activePanelTab.set(client.legalNature);
    this.panelVisible.set(true);
    this.notice.set({ key: 'loaded', subject: this.clientDisplayName(client) });
  }

  protected saveClient(event?: Event): void {
    event?.preventDefault();

    const prepared = this.prepareClientForSave(this.draft());
    if (!prepared) {
      return;
    }

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
    this.activeTableTab.set(savedClient.legalNature);
    this.activePanelTab.set(savedClient.legalNature);
    this.draft.set(this.cloneClient(savedClient));
    this.notice.set({ key: 'saved', subject: this.clientDisplayName(savedClient) });
  }

  protected requestDeleteClient(): void {
    const selectedId = this.selectedId();
    if (!selectedId) {
      this.notice.set({ key: 'selectToDelete' });
      return;
    }

    this.notice.set({ key: 'confirmDelete', subject: this.clientDisplayName(this.draft()) });
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

  protected updateField(field: ClientStringField, event: Event): void {
    this.setDraftField(
      field,
      (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value,
    );
  }

  protected setNature(nature: ClientNature): void {
    this.draft.update((draft) => ({ ...draft, legalNature: nature }));
    this.activeTableTab.set(nature);
    this.activePanelTab.set(nature);
  }

  protected isNature(value: PanelTab): value is ClientNature {
    return value === 'individual' || value === 'company';
  }

  protected fieldValue(field: ClientStringField): string {
    return this.draft()[field];
  }

  protected fieldOptions(field: ClientFieldConfig): readonly string[] {
    return field.options ?? [];
  }

  protected listFieldLines(field: ClientListField): string[] {
    return this.draft()[field].split('\n');
  }

  protected addContactLine(field: ClientListField): void {
    const lines = this.listFieldLines(field);
    this.setListFieldLines(field, [...lines, '']);
  }

  protected updateContactLine(field: ClientListField, index: number, event: Event): void {
    const lines = this.listFieldLines(field);
    lines[index] = (event.target as HTMLInputElement).value;
    this.setListFieldLines(field, lines);
  }

  protected removeContactLine(field: ClientListField, index: number): void {
    const lines = this.listFieldLines(field);

    if (lines.length <= 1) {
      this.setDraftField(field, '');
      return;
    }

    lines.splice(index, 1);
    this.setListFieldLines(field, lines);
  }

  protected representativeRows(): RepresentativeDraft[] {
    return this.parseRepresentatives(this.draft().additionalRepresentatives);
  }

  protected addRepresentative(): void {
    const representatives = this.representativeRows();
    representatives.push({ name: '', cpf: '', role: '', email: '', phone: '' });
    this.setDraftField(
      'additionalRepresentatives',
      this.serializeRepresentatives(representatives, true),
    );
  }

  protected updateRepresentative(index: number, field: RepresentativeField, event: Event): void {
    const representatives = this.representativeRows();
    representatives[index] = {
      ...representatives[index],
      [field]: (event.target as HTMLInputElement).value,
    };
    this.setDraftField(
      'additionalRepresentatives',
      this.serializeRepresentatives(representatives, true),
    );
  }

  protected removeRepresentative(index: number): void {
    const representatives = this.representativeRows();
    representatives.splice(index, 1);
    this.setDraftField(
      'additionalRepresentatives',
      this.serializeRepresentatives(representatives, true),
    );
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
    return `clients-table__status clients-table__status--${client.status}`;
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
    const folder = this.draft().folder;
    this.notice.set({ key: folder ? 'folderReady' : 'saveToCreateFolder', subject: folder });
    this.showMoreActions.set(false);
  }

  protected openFile(): void {
    const file = this.draft().file || this.selectedFileName();
    this.notice.set({ key: file ? 'fileReady' : 'noLinkedFile', subject: file });
    this.showMoreActions.set(false);
  }

  protected showLinkedProcesses(): void {
    const name = this.clientDisplayName(this.draft());
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

  private prepareClientForSave(client: IClient): IClient | null {
    const base = this.cloneClient(client);

    for (const field of this.uppercaseFields) {
      const current = base[field];
      (base as Record<ClientStringField, string>)[field] = this.toUppercaseName(current);
    }

    base.status = base.status || 'active';
    base.registeredBy = base.registeredBy.trim() || this.defaultUser;
    base.internalOwner = base.internalOwner.trim() || this.defaultUser;
    base.additionalIndividualEmails = this.cleanLines(base.additionalIndividualEmails).join('\n');
    base.additionalIndividualPhones = this.cleanLines(base.additionalIndividualPhones).join('\n');
    base.additionalCompanyEmails = this.cleanLines(base.additionalCompanyEmails).join('\n');
    base.additionalCompanyPhones = this.cleanLines(base.additionalCompanyPhones).join('\n');
    base.additionalRepresentativeEmails = this.cleanLines(base.additionalRepresentativeEmails).join(
      '\n',
    );
    base.additionalRepresentativePhones = this.cleanLines(base.additionalRepresentativePhones).join(
      '\n',
    );
    base.additionalRepresentatives = this.serializeRepresentatives(
      this.parseRepresentatives(base.additionalRepresentatives),
    );

    if (base.legalNature === 'individual' && !base.individualName.trim()) {
      this.notice.set({ key: 'individualNameRequired' });
      this.activePanelTab.set('individual');
      return null;
    }

    if (base.legalNature === 'company' && !base.companyLegalName.trim()) {
      this.notice.set({ key: 'companyNameRequired' });
      this.activePanelTab.set('company');
      return null;
    }

    if (!base.folder.trim()) {
      base.folder = this.clientFolderName(base);
    }

    const progress = base.progressEntry.trim();
    if (progress) {
      const historyLine = `${this.formatDateTime(new Date())} | ${progress}`;
      base.progressHistory = [base.progressHistory.trim(), historyLine].filter(Boolean).join('\n');
      base.progressEntry = '';
    }

    return base;
  }

  private createEmptyClient(nature: ClientNature): IClient {
    return {
      id: 0,
      registeredAt: new Date(),
      legalNature: nature,
      individualName: '',
      cpf: '',
      identityNumber: '',
      maritalStatus: '',
      occupation: '',
      nationality: '',
      individualEmail: '',
      additionalIndividualEmails: '',
      individualWhatsapp: '',
      additionalIndividualPhones: '',
      individualStreet: '',
      individualNumber: '',
      individualComplement: '',
      individualDistrict: '',
      individualState: 'CE',
      individualCity: 'Fortaleza',
      individualZipCode: '',
      individualNotes: '',
      companyLegalName: '',
      companyTradeName: '',
      cnpj: '',
      stateRegistration: '',
      municipalRegistration: '',
      companyEmail: '',
      additionalCompanyEmails: '',
      companyWhatsapp: '',
      additionalCompanyPhones: '',
      companyStreet: '',
      companyNumber: '',
      companyComplement: '',
      companyDistrict: '',
      companyState: 'CE',
      companyCity: 'Fortaleza',
      companyZipCode: '',
      legalRepresentativeName: '',
      legalRepresentativeCpf: '',
      legalRepresentativeRole: '',
      legalRepresentativeEmail: '',
      additionalRepresentativeEmails: '',
      legalRepresentativeWhatsapp: '',
      additionalRepresentativePhones: '',
      additionalRepresentatives: '',
      companyNotes: '',
      folder: '',
      file: '',
      registeredBy: this.defaultUser,
      status: 'active',
      contractNumber: '',
      contractDate: '',
      hiringMode: '',
      referredBy: '',
      internalOwner: this.defaultUser,
      notes: '',
      progressEntry: '',
      progressHistory: '',
      favorite: false,
    };
  }

  private cloneClient(client: IClient): IClient {
    return {
      ...client,
      registeredAt: new Date(client.registeredAt),
    };
  }

  private setDraftField(field: ClientStringField, value: string): void {
    this.draft.update((draft) => ({
      ...draft,
      [field]: value,
    }));
  }

  private setListFieldLines(field: ClientListField, lines: string[]): void {
    this.setDraftField(field, lines.join('\n'));
  }

  private parseSearchTerms(value: string): string[] {
    const matches = value.match(/"[^"]+"|\S+/g) ?? [];
    return matches.map((term) => term.replace(/^"|"$/g, '')).filter(Boolean);
  }

  private searchableClientText(client: IClient): string {
    return this.normalizeKey(
      [
        client.legalNature,
        client.individualName,
        client.companyLegalName,
        client.companyTradeName,
        client.cpf,
        client.cnpj,
        client.individualEmail,
        client.companyEmail,
        client.individualWhatsapp,
        client.companyWhatsapp,
        client.status,
        client.folder,
        client.file,
        client.registeredBy,
        client.internalOwner,
        client.hiringMode,
      ].join(' '),
    );
  }

  private compareColumnValues(left: string, right: string): number {
    return left.localeCompare(right, 'pt-BR', { numeric: true, sensitivity: 'base' });
  }

  private clientDisplayName(client: IClient): string {
    return client.legalNature === 'individual'
      ? client.individualName.trim()
      : (client.companyLegalName || client.companyTradeName).trim();
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

  private cleanLines(value: string): string[] {
    return value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }

  private parseRepresentatives(value: string): RepresentativeDraft[] {
    return value
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const [name = '', cpf = '', role = '', email = '', phone = ''] = line.split('|');
        return {
          name: name.trim(),
          cpf: cpf.trim(),
          role: role.trim(),
          email: email.trim(),
          phone: phone.trim(),
        };
      });
  }

  private serializeRepresentatives(
    representatives: RepresentativeDraft[],
    keepEmpty = false,
  ): string {
    return representatives
      .filter(
        (representative) =>
          keepEmpty || Object.values(representative).some((value) => value.trim()),
      )
      .map((representative) =>
        [
          representative.name,
          representative.cpf,
          representative.role,
          representative.email,
          representative.phone,
        ]
          .map((value) => value.trim())
          .join(' | '),
      )
      .join('\n');
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
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }
}
