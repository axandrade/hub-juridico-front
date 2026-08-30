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
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { map, startWith } from 'rxjs';

import {
  IClient,
  IRepresentanteLegal,
  TipoPessoa,
  emptyDossier,
  emptyPessoa,
} from '../../../../core/models';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import {
  ClientForm,
  createClientForm,
  patchClientForm,
  readClientForm,
} from '../../forms/client-form.factory';
import { ClientStore } from '../../services/client-store';
import { ClientAdminFormComponent } from '../client-admin-form/client-admin-form.component';
import { PessoaFormComponent } from '../pessoa-form/pessoa-form.component';

type PanelTab = 'person' | 'admin' | 'records' | 'files';

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
  | 'fileSelected'
  | 'folderReady'
  | 'saveToCreateFolder'
  | 'fileReady'
  | 'noLinkedFile'
  | 'naturalNameRequired'
  | 'legalNameRequired'
  | 'favoriteAdded'
  | 'favoriteRemoved';

interface EditorNotice {
  key: NoticeKey;
  subject?: string;
}

interface ClientFileRow {
  name: string;
  kind: 'folder' | 'mainFile' | 'contract';
  updatedAt: string;
}

/**
 * Painel autônomo de cadastro/edição de pessoa. Dono do `FormGroup` raiz; carrega a
 * ficha por id (ou vazia para novo cadastro), valida, e persiste via `ClientStore`.
 * O `clients-page` só decide qual `pessoaId` mostrar e reage aos outputs.
 */
@Component({
  selector: 'app-pessoa-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, ReactiveFormsModule, PessoaFormComponent, ClientAdminFormComponent],
  templateUrl: './pessoa-editor.component.html',
  styleUrl: './pessoa-editor.component.scss',
})
export class PessoaEditorComponent {
  private readonly store = inject(ClientStore);
  private readonly defaultUser = 'Lincoln';

  /** Id do registro a editar; `null` = novo cadastro. */
  readonly pessoaId = input<number | null>(null);
  /** Natureza de um cadastro novo (vem da aba ativa da tabela). */
  readonly novoTipo = input<TipoPessoa>('FISICA');

  readonly saved = output<IClient>();
  readonly removed = output<number>();
  readonly cleared = output<void>();

  /** Lido pela página (via `viewChild`) para travar a troca de ficha. */
  readonly locked = signal(false);

  protected readonly form: ClientForm = createClientForm();
  private readonly formValue = toSignal(
    this.form.valueChanges.pipe(
      startWith(null),
      map(() => this.form.getRawValue()),
    ),
    { requireSync: true },
  );
  private readonly pessoaValue = computed(() => this.formValue().pessoa);

  protected readonly entityId = signal(0);
  protected readonly registeredAt = signal(new Date());
  protected readonly favorite = signal(false);
  protected readonly activePanelTab = signal<PanelTab>('person');
  protected readonly fileSearch = signal('');
  protected readonly selectedFileName = signal('');
  protected readonly notice = signal<EditorNotice>({ key: 'selectOrCreate' });

  protected readonly panelTabs: readonly PanelTab[] = ['person', 'admin', 'records', 'files'];

  protected readonly tipoPessoaAtual = computed<TipoPessoa>(() => this.pessoaValue().tipo);

  protected readonly panelTitle = computed(() => {
    const pessoa = this.pessoaValue();
    return pessoa.tipo === 'FISICA'
      ? pessoa.nome.trim()
      : (pessoa.razaoSocial || pessoa.nomeFantasia).trim();
  });

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

  /** Última ficha carregada (`id:<n>` ou `new:<tipo>`) — evita recarregar à toa. */
  private lastLoadedKey = '';

  constructor() {
    // Recarrega a ficha só quando a página troca o id (ou o tipo de um cadastro novo).
    effect(() => {
      const id = this.pessoaId();
      const novoTipo = this.novoTipo();
      const key = id !== null ? `id:${id}` : `new:${novoTipo}`;
      if (key === this.lastLoadedKey) {
        return;
      }
      this.lastLoadedKey = key;

      untracked(() => {
        if (id !== null) {
          const found = this.store.buscar(id);
          if (found) {
            this.loadIntoForm(found);
            this.notice.set({ key: 'loaded', subject: this.clientDisplayName(found) });
          }
          return;
        }
        this.loadIntoForm(this.createEmptyClient(novoTipo));
        this.notice.set({ key: 'newClientStarted' });
      });
    });
  }

  /** Chamado pela página quando o lock impede carregar outra ficha. */
  notifyLockedSelection(): void {
    this.notice.set({ key: 'panelLockedSelection' });
  }

  protected setPanelTab(tab: PanelTab): void {
    this.activePanelTab.set(tab);
  }

  protected togglePanelLock(): void {
    this.locked.update((locked) => !locked);
    this.notice.set({ key: this.locked() ? 'panelLocked' : 'panelUnlocked' });
  }

  protected toggleFavorite(): void {
    const id = this.entityId();
    if (id > 0) {
      this.favorite.set(this.store.alternarFavorito(id));
    } else {
      this.favorite.update((value) => !value);
    }
    this.notice.set({
      key: this.favorite() ? 'favoriteAdded' : 'favoriteRemoved',
      subject: this.panelTitle(),
    });
  }

  protected save(event?: Event): void {
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
    this.store.salvar(prepared).subscribe((savedClient) => {
      this.loadIntoForm(savedClient);
      this.lastLoadedKey = `id:${savedClient.id}`;
      this.activePanelTab.set('person');
      this.notice.set({ key: 'saved', subject: this.clientDisplayName(savedClient) });
      this.saved.emit(savedClient);
    });
  }

  protected requestDelete(): void {
    if (this.entityId() <= 0) {
      this.notice.set({ key: 'selectToDelete' });
      return;
    }
    this.notice.set({ key: 'confirmDelete', subject: this.panelTitle() });
  }

  protected confirmDelete(): void {
    const id = this.entityId();
    if (id <= 0) {
      this.notice.set({ key: 'selectToDelete' });
      return;
    }
    this.store.remover(id).subscribe(() => {
      this.notice.set({ key: 'deleted' });
      this.removed.emit(id);
    });
  }

  protected clearPanel(): void {
    this.loadIntoForm(this.createEmptyClient(this.novoTipo()));
    this.lastLoadedKey = `new:${this.novoTipo()}`;
    this.activePanelTab.set('person');
    this.notice.set({ key: 'panelCleared' });
    this.cleared.emit();
  }

  protected updateFileSearch(event: Event): void {
    this.fileSearch.set((event.target as HTMLInputElement).value);
  }

  protected selectFile(row: ClientFileRow): void {
    this.selectedFileName.set(row.name);
    this.notice.set({ key: 'fileSelected', subject: row.name });
  }

  protected openFolder(): void {
    const folder = this.form.controls.dossier.controls.folder.value;
    this.notice.set({ key: folder ? 'folderReady' : 'saveToCreateFolder', subject: folder });
  }

  protected openFile(): void {
    const file = this.form.controls.dossier.controls.file.value || this.selectedFileName();
    this.notice.set({ key: file ? 'fileReady' : 'noLinkedFile', subject: file });
  }

  protected isPersisted(): boolean {
    return this.entityId() > 0;
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
    const base = structuredClone(client);

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

  private clientDisplayName(client: IClient): string {
    return client.pessoa.tipo === 'FISICA'
      ? client.pessoa.nome.trim()
      : (client.pessoa.razaoSocial || client.pessoa.nomeFantasia).trim();
  }

  private clientFolderName(client: IClient): string {
    const name = this.sanitizeFolderName(this.clientDisplayName(client) || 'CLIENTE');
    return `Pasta - ${this.formatClientId(client.id || this.store.proximoId())} - ${name}`;
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
