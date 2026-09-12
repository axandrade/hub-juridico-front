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
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { map, startWith } from 'rxjs';

import {
  IPessoa,
  IRepresentanteLegal,
  TipoPessoa,
  emptyDossie,
  emptyDadosPessoa,
} from '../../../../core/models';
import { AuthService } from '../../../../core/services/auth.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ToastService } from '../../../../shared/services/toast.service';
import { mensagensCamposInvalidos } from '../../../../shared/utils/form-validacao';
import {
  ClientForm,
  createClientForm,
  patchClientForm,
  readClientForm,
} from '../../forms/client-form.factory';
import {
  CLIENT_FIELD_LABELS,
  PESSOA_FISICA_FIELDS,
  PESSOA_JURIDICA_FIELDS,
} from '../../models/client-form.model';
import { StatusVinculoApi } from '../../services/client-api.model';
import { ClientService } from '../../services/client-service';
import { ClientAddressComponent } from '../client-address/client-address.component';
import { ClientAdminFormComponent } from '../client-admin-form/client-admin-form.component';
import { ClientContactListComponent } from '../client-contact-list/client-contact-list.component';
import { ClientEmailListComponent } from '../client-email-list/client-email-list.component';
import { ClientFieldComponent } from '../client-field/client-field.component';
import { ClientRepresentativesComponent } from '../client-representatives/client-representatives.component';
import { PanelLayoutSwitcherComponent } from '../../../../shared/components/panel-layout-switcher/panel-layout-switcher.component';
import { PAINEL_LAYOUT_PADRAO, PainelLayout } from '../../../../shared/models/panel-layout';

type PanelTab = 'person' | 'admin' | 'records';

/**
 * `selectOrCreate` (placeholder de painel vazio) e `confirmInactivate` (exige o botão Confirmar
 * ao lado) continuam no rodapé do painel — o resto das notificações agora é `ToastService`.
 */
type NoticeKey = 'selectOrCreate' | 'idle' | 'confirmInactivate';

interface EditorNotice {
  key: NoticeKey;
  subject?: string;
}

/**
 * Tela autônoma de cadastro/edição de pessoa (física ou jurídica). Dona do
 * `FormGroup` raiz; carrega a ficha por id (ou vazia para novo cadastro), valida,
 * e persiste via `ClientService`. O `clients` só decide qual `pessoaId` mostrar
 * e reage aos outputs.
 */
@Component({
  selector: 'app-client-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonComponent,
    ReactiveFormsModule,
    ClientFieldComponent,
    ClientAddressComponent,
    ClientEmailListComponent,
    ClientContactListComponent,
    ClientRepresentativesComponent,
    ClientAdminFormComponent,
    PanelLayoutSwitcherComponent,
  ],
  templateUrl: './client-form.component.html',
  styleUrl: './client-form.component.scss',
})
export class ClientFormComponent {
  private readonly clientService = inject(ClientService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  /** Nome do usuário logado — preenche "Cadastrado por" (campo do sistema). */
  private usuarioLogado(): string {
    return this.auth.user()?.name?.trim() || 'Sistema';
  }

  /** Id do registro a editar; `null` = novo cadastro. */
  readonly pessoaId = input<number | null>(null);
  /** Natureza de um cadastro novo (vem da aba ativa da tabela). */
  readonly novoTipo = input<TipoPessoa>('FISICA');
  /** Posição atual do painel na tela (a página é quem aplica). */
  readonly layoutPainel = input<PainelLayout>(PAINEL_LAYOUT_PADRAO);

  readonly saved = output<IPessoa>();
  readonly statusChanged = output<IPessoa>();
  readonly cleared = output<void>();
  readonly layoutPainelChange = output<PainelLayout>();

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
  /** `registro_andamento` como veio do backend — base para detectar mudança e logar no histórico. */
  private readonly loadedProgress = signal('');
  protected readonly activePanelTab = signal<PanelTab>('person');
  protected readonly notice = signal<EditorNotice>({ key: 'selectOrCreate' });
  protected readonly salvando = signal(false);

  protected readonly panelTabs: readonly PanelTab[] = ['person', 'admin', 'records'];

  protected readonly tipoPessoaAtual = computed<TipoPessoa>(() => this.pessoaValue().tipo);

  /** Natureza escolhida na hora de criar (sobrepõe `novoTipo` até salvar/limpar). */
  private readonly tipoNovoEscolhido = signal<TipoPessoa | null>(null);
  private readonly tipoParaNovo = computed<TipoPessoa>(() => this.tipoNovoEscolhido() ?? this.novoTipo());

  /** `true` quando o dossiê está `inactive` (⇒ `INATIVO` no backend). */
  protected readonly isInactive = computed(
    () => this.formValue().dossier.status === 'inactive',
  );

  /** Linhas de campos de identidade da aba "Dados pessoais" — alternam pelo tipo. */
  protected readonly identityRows = computed(() =>
    this.tipoPessoaAtual() === 'JURIDICA' ? PESSOA_JURIDICA_FIELDS : PESSOA_FISICA_FIELDS,
  );

  protected readonly panelTitle = computed(() => {
    const pessoa = this.pessoaValue();
    return pessoa.tipo === 'FISICA'
      ? pessoa.nome.trim()
      : (pessoa.razaoSocial || pessoa.nomeFantasia).trim();
  });

  /** Última ficha carregada (`id:<n>` ou `new:<tipo>`) — evita recarregar à toa. */
  private lastLoadedKey = '';

  constructor() {
    // Recarrega a ficha só quando a página troca o id (ou o tipo de um cadastro novo).
    effect(() => {
      const id = this.pessoaId();
      const novoTipo = this.tipoParaNovo();
      const key = id !== null ? `id:${id}` : `new:${novoTipo}`;
      if (key === this.lastLoadedKey) {
        return;
      }
      this.lastLoadedKey = key;

      untracked(() => {
        if (id !== null) {
          this.tipoNovoEscolhido.set(null);
          // Ficha completa à parte — a lista da tabela só carrega os campos que ela exibe.
          this.clientService.buscarCompleto(id).subscribe((found) => {
            if (found) {
              this.loadIntoForm(found);
              this.notice.set({ key: 'idle' });
            }
          });
          return;
        }
        this.loadIntoForm(this.createEmptyClient(novoTipo));
        this.locked.set(false);
        this.notice.set({ key: 'idle' });
      });
    });
  }

  /** Chamado pela página quando o lock impede carregar outra ficha. */
  notifyLockedSelection(): void {
    this.toast.info('Painel travado: destrave para carregar outro cliente.');
  }

  protected setPanelTab(tab: PanelTab): void {
    this.activePanelTab.set(tab);
  }

  protected togglePanelLock(): void {
    this.locked.update((locked) => !locked);
  }

  protected toggleFavorite(): void {
    const id = this.entityId();
    if (id > 0) {
      this.favorite.set(this.clientService.alternarFavorito(id));
    } else {
      this.favorite.update((value) => !value);
    }
    this.toast.sucesso(
      this.favorite()
        ? `${this.panelTitle()} marcado como favorito.`
        : `${this.panelTitle()} removido dos favoritos.`,
    );
  }

  protected save(event?: Event): void {
    event?.preventDefault();

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      const mensagens = mensagensCamposInvalidos(this.form.controls.pessoa, CLIENT_FIELD_LABELS);
      this.toast.erro(`Preencha corretamente: ${mensagens.join('; ')}`);
      this.activePanelTab.set('person');
      return;
    }

    const prepared = this.prepareClientForSave(this.assembleClient());
    this.salvando.set(true);
    this.clientService.salvar(prepared).subscribe({
      next: (savedClient) => {
        this.salvando.set(false);
        this.tipoNovoEscolhido.set(null);
        this.loadIntoForm(savedClient);
        this.lastLoadedKey = `id:${savedClient.id}`;
        this.activePanelTab.set('person');
        this.toast.sucesso(`Cliente salvo: ${this.clientDisplayName(savedClient)}.`);
        this.saved.emit(savedClient);
      },
      error: (err: unknown) => {
        this.salvando.set(false);
        this.toast.erro(`Não foi possível salvar: ${this.httpErrorMessage(err)}`);
      },
    });
  }

  /**
   * Ação do botão ativar/inativar (só aparece com o cliente já salvo). Inativar
   * pede confirmação; reativar é direto — não há exclusão, só muda o status via
   * `PATCH /pessoas/{id}/status`.
   */
  protected requestStatusChange(): void {
    if (this.isInactive()) {
      this.applyStatusChange('ATIVO');
      return;
    }
    this.notice.set({ key: 'confirmInactivate', subject: this.panelTitle() });
  }

  protected confirmInactivate(): void {
    this.applyStatusChange('INATIVO');
  }

  private applyStatusChange(status: StatusVinculoApi): void {
    const id = this.entityId();
    this.clientService.alterarStatus(id, status).subscribe({
      next: (updated) => {
        this.loadIntoForm(updated);
        this.toast.sucesso(`Cliente ${status === 'ATIVO' ? 'ativado' : 'inativado'}.`);
        this.statusChanged.emit(updated);
      },
      error: (err: unknown) => {
        this.toast.erro(`Não foi possível alterar o status: ${this.httpErrorMessage(err)}`);
      },
    });
  }

  protected clearPanel(): void {
    this.tipoNovoEscolhido.set(null);
    this.loadIntoForm(this.createEmptyClient(this.novoTipo()));
    this.lastLoadedKey = `new:${this.novoTipo()}`;
    this.locked.set(false);
    this.activePanelTab.set('person');
    this.toast.info('Painel limpo.');
    this.cleared.emit();
  }

  protected isPersisted(): boolean {
    return this.entityId() > 0;
  }

  /** Troca a natureza de um cadastro novo (física ⇄ jurídica). Sem efeito num registro salvo. */
  protected escolherNaturezaNova(tipo: TipoPessoa): void {
    if (this.isPersisted() || this.tipoPessoaAtual() === tipo) {
      return;
    }
    this.tipoNovoEscolhido.set(tipo);
  }

  protected escolherLayout(layout: PainelLayout): void {
    this.layoutPainelChange.emit(layout);
  }

  /** Control de string dentro do grupo `pessoa` (usado pelos campos da aba). */
  protected pessoaControl(key: string): FormControl<string> {
    return this.form.controls.pessoa.get(key) as FormControl<string>;
  }

  protected formatClientId(id: number): string {
    return id.toString().padStart(6, '0');
  }

  private loadIntoForm(client: IPessoa): void {
    this.entityId.set(client.id);
    this.registeredAt.set(new Date(client.registeredAt));
    this.favorite.set(client.favorite);
    this.loadedProgress.set(client.dossier.progressEntry);
    patchClientForm(this.form, client);
  }

  private assembleClient(): IPessoa {
    return {
      ...readClientForm(this.form),
      id: this.entityId(),
      registeredAt: this.registeredAt(),
      favorite: this.favorite(),
    };
  }

  private prepareClientForSave(client: IPessoa): IPessoa {
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
    base.pessoa.representantesFinanceiros = base.pessoa.representantesFinanceiros.map(
      (representante): IRepresentanteLegal => ({
        ...representante,
        nome: this.toUppercaseName(representante.nome),
      }),
    );

    const dossier = base.dossier;
    dossier.status = dossier.status || 'active';
    dossier.registeredBy = dossier.registeredBy.trim() || this.usuarioLogado();
    dossier.internalOwner = dossier.internalOwner.trim() || this.usuarioLogado();

    if (!dossier.folder.trim()) {
      dossier.folder = this.clientFolderName(base);
    }

    // `progressEntry` é o andamento atual (persiste em `registro_andamento`).
    // Toda vez que muda, registra uma linha datada no histórico.
    const progress = dossier.progressEntry.trim();
    dossier.progressEntry = progress;
    if (progress && progress !== this.loadedProgress().trim()) {
      const historyLine = `${this.formatDateTime(new Date())} | ${progress}`;
      dossier.progressHistory = [dossier.progressHistory.trim(), historyLine]
        .filter(Boolean)
        .join('\n');
    }

    return base;
  }

  private createEmptyClient(tipoPessoa: TipoPessoa): IPessoa {
    return {
      id: 0,
      registeredAt: new Date(),
      favorite: false,
      pessoa: emptyDadosPessoa(tipoPessoa),
      dossier: {
        ...emptyDossie(),
        registeredBy: this.usuarioLogado(),
        internalOwner: this.usuarioLogado(),
      },
    };
  }

  private clientDisplayName(client: IPessoa): string {
    return client.pessoa.tipo === 'FISICA'
      ? client.pessoa.nome.trim()
      : (client.pessoa.razaoSocial || client.pessoa.nomeFantasia).trim();
  }

  private clientFolderName(client: IPessoa): string {
    const name = this.sanitizeFolderName(this.clientDisplayName(client) || 'CLIENTE');
    return `Pasta - ${this.formatClientId(client.id || this.clientService.proximoId())} - ${name}`;
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

  private formatDateTime(date: Date): string {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  /** Extrai a mensagem legível de um erro HTTP (ProblemDetail do backend). */
  private httpErrorMessage(err: unknown): string {
    const e = err as {
      error?: { detail?: string; title?: string; message?: string };
      message?: string;
      status?: number;
    };
    if (e?.status === 0) {
      return 'Sem conexão com o servidor.';
    }
    return (
      e?.error?.detail ||
      e?.error?.title ||
      e?.error?.message ||
      e?.message ||
      'Erro ao comunicar com o servidor.'
    );
  }
}
