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
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, debounceTime, distinctUntilChanged, skip, switchMap } from 'rxjs';

import { ModalidadeCliente, IPessoa, TipoPessoa } from '../../core/models';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { PanelShellController } from '../../shared/panel-shell/panel-shell.controller';
import { PastaClienteService } from './services/pasta-cliente.service';
import { ClientService, ClientListQuery } from './services/client-service';
import { ClientFormComponent } from './components/client-form/client-form.component';
import { emailPrincipal, contatoPrincipal } from '../../core/models';
import { DataTableComponent } from '../../shared/components/table/data-table.component';
import { TableColumn } from '../../shared/components/table/table-column.model';
import { TablePagination, TablePinAction } from '../../shared/components/table/table.model';

type PageNotice = '' | 'loadError';

@Component({
  selector: 'app-clients',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, ClientFormComponent, DataTableComponent],
  templateUrl: './clients.component.html',
  styleUrl: './clients.component.scss',
})
export class ClientsComponent {
  private readonly clientService = inject(ClientService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly pastaCliente = inject(PastaClienteService);

  private readonly editor = viewChild(ClientFormComponent);
  /** A grade de clientes — o botão "Colunas" da barra de ações comanda esta instância. */
  protected readonly clientsTable = viewChild(DataTableComponent);

  protected readonly selectedPersonId = signal<number | null>(null);
  /** Posição/tamanho/visibilidade do painel — ver `PanelShellController`. */
  protected readonly panelShell = new PanelShellController(this.document, {
    storagePrefix: 'hub-juridico.clients',
  });
  protected readonly pageNotice = signal<PageNotice>('');
  protected readonly loading = signal(false);

  /** Página pedida ao backend (0-based) e gatilho de recarregamento manual. */
  private readonly page = signal(0);
  private readonly reloadTick = signal(0);
  /** `true` traz também clientes inativos — reflete exatamente o `incluirInativos` do backend. */
  protected readonly incluirInativos = signal(false);
  /** Busca livre (nome/razão, CPF/CNPJ, e-mail) — resolvida no servidor, com debounce. */
  protected readonly busca = signal('');
  /** Filtro de natureza (chips) — `''` = todos. Resolvido no servidor. */
  protected readonly tipoFiltro = signal<TipoPessoa | ''>('');

  protected readonly clients = this.clientService.clients;
  protected readonly totalClients = this.clientService.totalElements;
  protected readonly pagination = computed<TablePagination>(() => ({
    page: this.clientService.page(),
    totalPages: this.clientService.totalPages(),
    totalElements: this.clientService.totalElements(),
    last: this.clientService.last(),
  }));

  protected readonly clientColumns: TableColumn<IPessoa>[] = [
    {
      key: 'tipo',
      header: 'Natureza',
      width: '138px',
      formatter: (_value, row) => (row.pessoa.tipo === 'FISICA' ? 'Pessoa física' : 'Pessoa jurídica'),
    },
    {
      key: 'nome',
      header: 'Nome / Razão',
      width: '240px',
      formatter: (_value, row) => this.clientDisplayName(row) || '-',
    },
    {
      key: 'cpf_cnpj',
      header: 'CPF / CNPJ',
      width: '170px',
      formatter: (_value, row) => (row.pessoa.tipo === 'FISICA' ? row.pessoa.cpf : row.pessoa.cnpj) || '-',
    },
    {
      key: 'email',
      header: 'E-mail',
      width: '230px',
      formatter: (_value, row) => emailPrincipal(row.pessoa.emails) || '-',
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
    }

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
    // Busca com debounce: só dispara requisição 300ms depois de parar de digitar.
    const buscaDebounced = toSignal(
      toObservable(this.busca).pipe(debounceTime(300), distinctUntilChanged()),
      { initialValue: this.busca() },
    );
    // Nova busca sempre volta pra primeira página.
    toObservable(buscaDebounced)
      .pipe(skip(1), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.page.set(0));

    const query = computed<ClientListQuery & { tick: number }>(() => ({
      page: this.page(),
      tipo: this.tipoFiltro() || null,
      incluirInativos: this.incluirInativos(),
      busca: buscaDebounced(),
      tick: this.reloadTick(),
    }));

    toObservable(query)
      .pipe(
        switchMap((q) => {
          this.loading.set(true);
          return this.clientService.carregar(q).pipe(
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

    // Publica o cliente selecionado para o diálogo "Abrir pasta do cliente" (global, no layout).
    effect(() => {
      const id = this.selectedPersonId();
      const cliente = id !== null ? this.clientService.buscar(id) : null;
      this.pastaCliente.definirCliente(
        cliente
          ? { id: cliente.id, nome: this.clientDisplayName(cliente) }
          : id !== null && id > 0
            ? { id, nome: '' }
            : null,
      );
    });

    // Ao sair de /clientes, esquece a seleção: em qualquer outra tela o diálogo abre na visão geral.
    this.destroyRef.onDestroy(() => this.pastaCliente.definirCliente(null));
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

  protected onBuscaInput(event: Event): void {
    this.busca.set((event.target as HTMLInputElement).value);
  }

  protected limparBusca(): void {
    this.busca.set('');
  }

  /** Chip de natureza (`''` = Todos). Seleção direta, estilo rádio. */
  protected selecionarTipo(tipo: TipoPessoa | ''): void {
    // Ignora troca de aba enquanto a lista carrega — evita a rajada de requisições canceladas
    // quando o usuário clica repetido esperando a grade responder (banco lento).
    if (this.loading() || this.tipoFiltro() === tipo) {
      return;
    }
    this.tipoFiltro.set(tipo);
    this.page.set(0);
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
    this.clientService.alternarFavorito(row.id);
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
   * Clique fora fecha o menu "Colunas" e — se o cadeado não estiver travado — também desmarca o
   * cliente (clique fora de uma linha da tabela e do painel).
   */
  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;

    const tabela = this.clientsTable();
    if (tabela?.columnsMenuOpen() && !target?.closest('.clients-columns')) {
      tabela.columnsMenuOpen.set(false);
    }

    if (this.selectedPersonId() === null || this.editor()?.locked() || this.panelShell.redimensionando) {
      return;
    }
    if (
      !target ||
      target.closest('tr, app-client-form, app-document-explorer, app-modal, app-header, .clients-resizer')
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
