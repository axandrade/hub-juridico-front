import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, switchMap } from 'rxjs';

import { onlyDigits } from '../../core/auth/cpf';
import { ModalidadeCliente, IPessoa, TipoPessoa } from '../../core/models';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { ModalComponent } from '../../shared/components/modal/modal.component';
import { PanelShellController } from '../../shared/panel-shell/panel-shell.controller';
import { PastaClienteService } from './services/pasta-cliente.service';
import { ClientStore, ClientListQuery } from './services/client-store';
import { ClientFormComponent } from './components/client-form/client-form.component';
import { ClientFilesComponent, ClientFilesNotice } from './components/client-files/client-files.component';
import { emailPrincipal, contatoPrincipal } from '../../core/models';
import { DataTableComponent } from '../../shared/components/table/data-table.component';
import { TableColumn } from '../../shared/components/table/table-column.model';
import { TablePagination, TablePinAction } from '../../shared/components/table/table.model';

type PageNotice = '' | 'shareReady' | 'importReady' | 'loadError';

@Component({
  selector: 'app-clients',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonComponent,
    ClientFormComponent,
    ModalComponent,
    ClientFilesComponent,
    DataTableComponent,
  ],
  templateUrl: './clients.component.html',
  styleUrl: './clients.component.scss',
})
export class ClientsComponent {
  private readonly store = inject(ClientStore);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly pastaCliente = inject(PastaClienteService);

  private readonly editor = viewChild(ClientFormComponent);

  protected readonly selectedPersonId = signal<number | null>(null);
  /** Posição/tamanho/visibilidade do painel — ver `PanelShellController`. */
  protected readonly panelShell = new PanelShellController(this.document, {
    storagePrefix: 'hub-juridico.clients',
  });
  /** Aviso da pasta do cliente (upload/remoção/erro) mostrado dentro do diálogo. */
  protected readonly pastaNotice = signal<string | null>(null);
  protected readonly showMoreActions = signal(false);
  protected readonly pageNotice = signal<PageNotice>('');
  protected readonly loading = signal(false);

  /** Página pedida ao backend (0-based) e gatilho de recarregamento manual. */
  private readonly page = signal(0);
  private readonly reloadTick = signal(0);
  /** `true` traz também clientes inativos — reflete exatamente o `incluirInativos` do backend. */
  protected readonly incluirInativos = signal(false);
  /** Valor atual de cada filtro de coluna (server: `tipo`; client-side: `nome`/`cpf_cnpj`/`email`). */
  protected readonly columnFilterValues = signal<Record<string, string>>({});

  protected readonly clients = this.store.clients;
  protected readonly totalClients = this.store.totalElements;
  protected readonly pagination = computed<TablePagination>(() => ({
    page: this.store.page(),
    totalPages: this.store.totalPages(),
    totalElements: this.store.totalElements(),
    last: this.store.last(),
  }));

  /** Filtro client-side (nome/CPF-CNPJ/e-mail) sobre a página de 10 linhas já carregada. */
  protected readonly clientFilterPredicate = computed<((row: IPessoa) => boolean) | null>(() => {
    const filtros = this.columnFilterValues();
    const nome = filtros['nome']?.trim().toLowerCase() ?? '';
    const documento = onlyDigits(filtros['cpf_cnpj'] ?? '');
    const email = filtros['email']?.trim().toLowerCase() ?? '';
    if (!nome && !documento && !email) {
      return null;
    }
    return (row: IPessoa): boolean => {
      if (nome && !this.clientDisplayName(row).toLowerCase().includes(nome)) {
        return false;
      }
      if (documento) {
        const doc = onlyDigits(row.pessoa.tipo === 'FISICA' ? row.pessoa.cpf : row.pessoa.cnpj);
        if (!doc.includes(documento)) {
          return false;
        }
      }
      if (email && !row.pessoa.emails.some((e) => e.endereco.toLowerCase().includes(email))) {
        return false;
      }
      return true;
    };
  });

  protected readonly clientColumns: TableColumn<IPessoa>[] = [
    {
      key: 'tipo',
      header: 'Natureza',
      width: '138px',
      formatter: (_value, row) => (row.pessoa.tipo === 'FISICA' ? 'Pessoa física' : 'Pessoa jurídica'),
      filter: {
        type: 'select',
        options: [
          { value: '', label: 'Todos' },
          { value: 'FISICA', label: 'Pessoa física' },
          { value: 'JURIDICA', label: 'Pessoa jurídica' },
        ],
      },
    },
    {
      key: 'nome',
      header: 'Nome / Razão',
      width: '240px',
      formatter: (_value, row) => this.clientDisplayName(row) || '-',
      filter: { type: 'text' },
    },
    {
      key: 'cpf_cnpj',
      header: 'CPF / CNPJ',
      width: '170px',
      formatter: (_value, row) => (row.pessoa.tipo === 'FISICA' ? row.pessoa.cpf : row.pessoa.cnpj) || '-',
      filter: { type: 'text' },
    },
    {
      key: 'email',
      header: 'E-mail',
      width: '230px',
      formatter: (_value, row) => emailPrincipal(row.pessoa.emails) || '-',
      filter: { type: 'text' },
    },
    {
      key: 'telefone',
      header: 'Telefone',
      width: '160px',
      formatter: (_value, row) => contatoPrincipal(row.pessoa.contatos) || '-',
    },
    {
      key: 'status',
      header: 'Status',
      width: '110px',
      align: 'center',
      format: 'badge',
      badgeDot: true,
      formatter: (_value, row) => (row.dossier.status === 'active' ? 'Ativo' : 'Inativo'),
      badgeTone: (_value, row) => (row.dossier.status === 'active' ? 'success' : 'neutral'),
    },
    {
      key: 'cadastrado_por_nome',
      header: 'Cadastrado por',
      width: '150px',
      formatter: (_value, row) => row.dossier.registeredBy || '-',
    },
    {
      key: 'modalidade',
      header: 'Modalidade',
      width: '150px',
      formatter: (_value, row) => this.hiringModeLabel(row.dossier.hiringMode),
    },
    {
      key: 'responsavel_interno',
      header: 'Responsável',
      width: '160px',
      formatter: (_value, row) => row.dossier.internalOwner || '-',
    },
  ];

  protected readonly clientPinFirst = (row: IPessoa): boolean => row.favorite;

  protected readonly clientRowClass = (row: IPessoa): Record<string, boolean> => ({
    'is-selected': this.selectedPersonId() === row.id,
    'is-favorite': row.favorite,
    'is-inactive': row.dossier.status === 'inactive',
  });

  protected readonly clientPinAction: TablePinAction<IPessoa> = {
    isActive: (row) => row.favorite,
    onToggle: (row, event) => this.toggleClientFavorite(row, event),
    ariaLabel: 'Favoritar cliente',
  };

  constructor() {
    const query = computed<ClientListQuery & { tick: number }>(() => ({
      page: this.page(),
      tipo: (this.columnFilterValues()['tipo'] as TipoPessoa) || null,
      incluirInativos: this.incluirInativos(),
      tick: this.reloadTick(),
    }));

    toObservable(query)
      .pipe(
        switchMap((q) => {
          this.loading.set(true);
          return this.store.carregar(q).pipe(
            catchError(() => {
              this.loading.set(false);
              this.pageNotice.set('loadError');
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.loading.set(false);
        if (this.pageNotice() === 'loadError') {
          this.pageNotice.set('');
        }
      });

    // Publica o cliente selecionado para o header ("Abrir pasta do cliente").
    effect(() => {
      const id = this.selectedPersonId();
      const cliente = id !== null ? this.store.buscar(id) : null;
      this.pastaCliente.definirCliente(
        cliente
          ? { id: cliente.id, nome: this.clientDisplayName(cliente) }
          : id !== null && id > 0
            ? { id, nome: '' }
            : null,
      );
    });
  }

  private goToFirstPage(): void {
    this.page.set(0);
    this.reloadTick.update((tick) => tick + 1);
  }

  private refreshList(): void {
    this.reloadTick.update((tick) => tick + 1);
  }

  protected onPageChange(page: number): void {
    this.page.set(page);
  }

  /** Confirma (ou limpa, se `value` vazio) o filtro de uma coluna; `tipo` recarrega no servidor. */
  protected onColumnFilterChange({ key, value }: { key: string; value: string }): void {
    this.columnFilterValues.update((atual) => {
      if (!value.trim()) {
        const { [key]: _removido, ...resto } = atual;
        return resto;
      }
      return { ...atual, [key]: value };
    });
    if (key === 'tipo') {
      this.page.set(0);
    }
  }

  protected onToggleIncluirInativos(event: Event): void {
    this.incluirInativos.set((event.target as HTMLInputElement).checked);
    this.page.set(0);
  }

  protected onLoadError(): void {
    this.pageNotice.set('loadError');
  }

  protected reloadList(): void {
    this.refreshList();
  }

  /** No modo diálogo, Esc esconde o painel (mantém o cliente selecionado). */
  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (
      this.panelShell.layoutPainel() === 'dialog' &&
      this.panelShell.panelVisible() &&
      !this.temModalAberto()
    ) {
      this.panelShell.setPanelVisible(false);
    }
  }

  /** Há um `app-modal` (upload, preview de documento…) aberto dentro do painel? */
  private temModalAberto(): boolean {
    return !!this.document.querySelector('app-modal .modal__dialog');
  }

  protected toggleClientFavorite(row: IPessoa, event: MouseEvent): void {
    event.stopPropagation();
    this.store.alternarFavorito(row.id);
  }

  protected newRecord(): void {
    this.selectedPersonId.set(null);
    this.panelShell.setPanelVisible(true);
  }

  protected selectClient(row: IPessoa | null): void {
    const id = row ? row.id : null;

    const editor = this.editor();
    if (editor?.locked() && this.selectedPersonId() !== id) {
      editor.notifyLockedSelection();
      return;
    }

    this.selectedPersonId.set(id);
    this.panelShell.setPanelVisible(true);
  }

  /**
   * Clique fora fecha o menu "Mais..." e — se o cadeado não estiver travado —
   * também desmarca o cliente (clique fora de uma linha da tabela e do painel).
   */
  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;

    if (this.showMoreActions() && !target?.closest('.clients-actions__menu')) {
      this.showMoreActions.set(false);
    }

    if (this.selectedPersonId() === null || this.editor()?.locked() || this.panelShell.redimensionando) {
      return;
    }
    if (
      !target ||
      target.closest('tr, app-client-form, app-client-files, app-modal, app-header, .clients-resizer')
    ) {
      return;
    }
    this.selectedPersonId.set(null);
  }

  protected onSaved(client: IPessoa): void {
    this.selectedPersonId.set(client.id);
    this.goToFirstPage();
  }

  protected onCleared(): void {
    this.selectedPersonId.set(null);
    this.refreshList();
  }

  /** Ativação/inativação: o registro continua existindo, então mantém a seleção. */
  protected onStatusChanged(client: IPessoa): void {
    this.selectedPersonId.set(client.id);
    this.refreshList();
  }

  protected fecharPasta(): void {
    this.pastaCliente.fechar();
    this.pastaNotice.set(null);
  }

  protected onPastaNotice(evento: ClientFilesNotice): void {
    const alvo = evento.subject ?? '';
    const textos: Record<ClientFilesNotice['key'], string> = {
      saveBeforeUpload: 'Salve o cliente antes de anexar arquivos.',
      uploadOk: `Arquivo enviado: ${alvo}`,
      uploadError: `Não foi possível enviar: ${alvo}`,
      fileRemoved: `Arquivo removido: ${alvo}`,
      removeError: `Não foi possível remover: ${alvo}`,
      downloadError: `Não foi possível baixar: ${alvo}`,
      viewError: `Não foi possível abrir: ${alvo}`,
    };
    this.pastaNotice.set(textos[evento.key]);
  }

  protected shareBase(): void {
    this.pageNotice.set('shareReady');
    this.showMoreActions.set(false);
  }

  protected importBase(): void {
    this.pageNotice.set('importReady');
    this.showMoreActions.set(false);
  }

  protected toggleMoreActions(): void {
    this.showMoreActions.update((visible) => !visible);
  }

  private hiringModeLabel(mode: ModalidadeCliente | ''): string {
    switch (mode) {
      case 'oneOff':
        return 'Avulso';
      case 'monthly':
        return 'Mensalista';
      case 'successFee':
        return 'Êxito';
      case 'advisory':
        return 'Consultivo';
      case 'litigation':
        return 'Contencioso';
      case 'mixed':
        return 'Misto';
      default:
        return '-';
    }
  }

  private clientDisplayName(client: IPessoa): string {
    return client.pessoa.tipo === 'FISICA'
      ? client.pessoa.nome.trim()
      : (client.pessoa.razaoSocial || client.pessoa.nomeFantasia).trim();
  }
}
