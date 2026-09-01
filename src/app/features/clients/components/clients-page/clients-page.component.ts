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
import { EMPTY, catchError, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';

import { maskCnpj, maskCpf, onlyDigits } from '../../../../core/auth/cpf';
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
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import {
  PAINEL_LAYOUT_PADRAO,
  PainelLayout,
  ehPainelLayout,
} from '../../models/painel-layout';
import { PastaClienteService } from '../../services/pasta-cliente.service';
import { PessoaStore, TipoDocumento } from '../../services/pessoa-store';
import { PessoaFormComponent } from '../pessoa-form/pessoa-form.component';
import { PessoaFilesComponent, PessoaFilesNotice } from '../pessoa-files/pessoa-files.component';

const LAYOUT_STORAGE_KEY = 'hub-juridico.clients.layout';
const LARGURA_STORAGE_KEY = 'hub-juridico.clients.painelLargura';
const ALTURA_STORAGE_KEY = 'hub-juridico.clients.painelAltura';

/** Limites (px) do redimensionamento do painel. */
const PAINEL_LARGURA_MIN = 300;
const PAINEL_LARGURA_MAX = 680;
const PAINEL_LARGURA_PADRAO = 400;
const PAINEL_ALTURA_MIN = 220;
const PAINEL_ALTURA_MAX = 640;
const PAINEL_ALTURA_PADRAO = 340;

type ColunaTabelaKey =
  | 'personType'
  | 'name'
  | 'document'
  | 'email'
  | 'phone'
  | 'status'
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
  imports: [ButtonComponent, PessoaFormComponent, ModalComponent, PessoaFilesComponent],
  templateUrl: './clients-page.component.html',
  styleUrl: './clients-page.component.scss',
})
export class ClientsPageComponent {
  private readonly store = inject(PessoaStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  protected readonly pastaCliente = inject(PastaClienteService);
  private readonly defaultVisibleColumns: readonly ColunaTabelaKey[] = [
    'personType',
    'name',
    'document',
    'email',
    'phone',
    'status',
    'registeredBy',
  ];

  private readonly editor = viewChild(PessoaFormComponent);

  protected readonly clients = this.store.clients;
  protected readonly selectedPersonId = signal<number | null>(null);
  /** Página pedida ao backend (0-based). */
  protected readonly pageIndex = signal(0);
  /** Bumpado para forçar um recarregamento com os mesmos filtros. */
  private readonly refreshTick = signal(0);
  /**
   * `true` pede ao backend também os clientes inativos (padrão: só ativos).
   * Ligado automaticamente quando o filtro de status é "Inativo".
   */
  protected readonly incluirInativos = signal(false);
  /** Posição do painel do cliente (esquerda/direita/abaixo/diálogo) — lembrada no localStorage. */
  protected readonly layoutPainel = signal<PainelLayout>(this.carregarLayout());
  /** No modo diálogo o painel começa oculto (só aparece ao selecionar/criar um cliente). */
  protected readonly panelVisible = signal(this.layoutPainel() !== 'dialog');
  /** Tamanho do painel (px) — largura nos modos esquerda/direita, altura no modo abaixo. */
  protected readonly painelLargura = signal(
    this.carregarTamanho(LARGURA_STORAGE_KEY, PAINEL_LARGURA_PADRAO, PAINEL_LARGURA_MIN, PAINEL_LARGURA_MAX),
  );
  protected readonly painelAltura = signal(
    this.carregarTamanho(ALTURA_STORAGE_KEY, PAINEL_ALTURA_PADRAO, PAINEL_ALTURA_MIN, PAINEL_ALTURA_MAX),
  );
  /** `true` durante o arraste — usado para não desmarcar o cliente no clique que segue. */
  private redimensionando = false;
  /** Aviso da pasta do cliente (upload/remoção/erro) mostrado dentro do diálogo. */
  protected readonly pastaNotice = signal<string | null>(null);
  protected readonly showFilters = signal(false);
  protected readonly showColumns = signal(false);
  protected readonly showMoreActions = signal(false);
  protected readonly searchText = signal('');
  protected readonly sortColumn = signal<ColunaTabelaKey>('name');
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

  /**
   * Tipo de cliente (`FISICA` / `JURIDICA`; vazio = todos) — vai ao backend como `tipo`.
   * Quando definido, habilita o filtro por número de documento: `docDigits` guarda só os
   * dígitos digitados e `docDigitsDebounced` evita uma requisição por tecla.
   */
  protected readonly tipoCliente = signal<TipoPessoa | ''>('');
  private readonly docDigits = signal('');
  private readonly docDigitsDebounced = toSignal(
    toObservable(this.docDigits).pipe(debounceTime(300)),
    { initialValue: '' },
  );
  protected readonly docNumberMasked = computed(() =>
    this.tipoCliente() === 'JURIDICA' ? maskCnpj(this.docDigits()) : maskCpf(this.docDigits()),
  );
  /** Documento correspondente ao tipo de cliente (para o parâmetro `tipoDocumento`). */
  private readonly tipoDocumento = computed<TipoDocumento | null>(() => {
    switch (this.tipoCliente()) {
      case 'FISICA':
        return 'CPF';
      case 'JURIDICA':
        return 'CNPJ';
      default:
        return null;
    }
  });
  protected readonly tipoClienteOptions: readonly TipoPessoa[] = ['FISICA', 'JURIDICA'];

  protected readonly statusOptions = STATUS_CLIENTE;
  protected readonly hiringModeOptions = MODALIDADES_CLIENTE;

  /** Total de clientes do filtro atual (base inteira quando sem filtro de tipo/busca). */
  protected readonly totalClients = this.store.totalElements;
  /** Página atual exibida (1-based, para leitura humana). */
  protected readonly currentPageLabel = computed(() => this.store.page() + 1);
  /** Quantidade de páginas do filtro atual (mínimo 1). */
  protected readonly pageCount = computed(() => Math.max(this.store.totalPages(), 1));
  protected readonly canGoPrev = computed(() => this.store.page() > 0);
  protected readonly canGoNext = computed(() => !this.store.last());

  /** Tipo enviado ao backend: `null` quando o filtro está em "Todos". */
  private readonly tipoFilter = computed<TipoPessoa | null>(() => this.tipoCliente() || null);

  /** Natureza de um cadastro novo — sem filtro de tipo, começa como física. */
  protected readonly novoTipoPadrao = computed<TipoPessoa>(() => this.tipoCliente() || 'FISICA');

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
        this.tipoCliente(),
        this.docDigits(),
      ].filter(Boolean).length,
  );

  constructor() {
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

    // Uma requisição por combinação de página + filtros do endpoint (tipo, inativos, documento).
    // `refreshTick` força recarregar após salvar/apagar.
    const query = computed(() => ({
      page: this.pageIndex(),
      tipo: this.tipoFilter(),
      incluirInativos: this.incluirInativos(),
      tipoDocumento: this.tipoDocumento(),
      documento: this.docDigitsDebounced(),
      tick: this.refreshTick(),
    }));

    toObservable(query)
      .pipe(
        distinctUntilChanged(
          (a, b) =>
            a.page === b.page &&
            a.tipo === b.tipo &&
            a.incluirInativos === b.incluirInativos &&
            a.tipoDocumento === b.tipoDocumento &&
            a.documento === b.documento &&
            a.tick === b.tick,
        ),
        switchMap(({ page, tipo, incluirInativos, tipoDocumento, documento }) =>
          this.store.carregar({ page, tipo, incluirInativos, tipoDocumento, documento }).pipe(
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

  /** Limite de dígitos do documento conforme o tipo de cliente (CPF 11, CNPJ 14). */
  private docLimit(): number {
    return this.tipoCliente() === 'JURIDICA' ? 14 : 11;
  }

  private limparTipoCliente(): void {
    this.tipoCliente.set('');
    this.docDigits.set('');
  }

  protected updateTipoCliente(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as TipoPessoa | '';
    this.tipoCliente.set(value);
    // "Todos" zera o número; troca de tipo apenas corta ao novo limite.
    this.docDigits.update((digits) => (value ? digits.slice(0, this.docLimit()) : ''));
    this.pageIndex.set(0);
  }

  protected updateDocNumber(event: Event): void {
    this.docDigits.set(onlyDigits((event.target as HTMLInputElement).value).slice(0, this.docLimit()));
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

  protected setPanelVisible(visivel: boolean): void {
    this.panelVisible.set(visivel);
  }

  protected setLayoutPainel(layout: PainelLayout): void {
    this.layoutPainel.set(layout);
    // Ao trocar de posição, mostra o painel ali (senão o usuário clica e nada muda).
    this.panelVisible.set(true);
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEY, layout);
    } catch {
      /* storage indisponível — a escolha vale só nesta sessão */
    }
  }

  private carregarLayout(): PainelLayout {
    try {
      const salvo = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (ehPainelLayout(salvo)) {
        return salvo;
      }
    } catch {
      /* ignore */
    }
    return PAINEL_LAYOUT_PADRAO;
  }

  // --- redimensionamento do painel ---

  private carregarTamanho(chave: string, padrao: number, min: number, max: number): number {
    try {
      const salvo = Number(localStorage.getItem(chave));
      if (Number.isFinite(salvo) && salvo > 0) {
        return this.limitar(salvo, min, max);
      }
    } catch {
      /* ignore */
    }
    return padrao;
  }

  private limitar(valor: number, min: number, max: number): number {
    return Math.min(Math.max(valor, min), max);
  }

  /** Começa a arrastar a divisória painel/tabela. */
  protected iniciarResize(event: PointerEvent): void {
    event.preventDefault();
    const layout = this.layoutPainel();
    const vertical = layout === 'bottom';
    const inicioPonteiro = vertical ? event.clientY : event.clientX;
    const tamanhoInicial = vertical ? this.painelAltura() : this.painelLargura();
    // esquerda: arrastar p/ direita alarga; direita/abaixo: arrastar p/ o lado oposto alarga.
    const sinal = layout === 'left' ? 1 : -1;

    const mover = (e: PointerEvent) => {
      this.redimensionando = true;
      const atual = vertical ? e.clientY : e.clientX;
      const delta = (atual - inicioPonteiro) * sinal;
      if (vertical) {
        this.painelAltura.set(this.limitar(tamanhoInicial + delta, PAINEL_ALTURA_MIN, PAINEL_ALTURA_MAX));
      } else {
        this.painelLargura.set(
          this.limitar(tamanhoInicial + delta, PAINEL_LARGURA_MIN, PAINEL_LARGURA_MAX),
        );
      }
    };

    const encerrar = () => {
      this.document.removeEventListener('pointermove', mover);
      this.document.removeEventListener('pointerup', encerrar);
      this.document.body.style.userSelect = '';
      this.document.body.style.cursor = '';
      this.persistirTamanho(vertical ? ALTURA_STORAGE_KEY : LARGURA_STORAGE_KEY,
        vertical ? this.painelAltura() : this.painelLargura());
      // Limpa a flag depois do clique sintético que fecha o arraste.
      setTimeout(() => (this.redimensionando = false));
    };

    this.document.addEventListener('pointermove', mover);
    this.document.addEventListener('pointerup', encerrar);
    this.document.body.style.userSelect = 'none';
    this.document.body.style.cursor = vertical ? 'row-resize' : 'col-resize';
  }

  private persistirTamanho(chave: string, valor: number): void {
    try {
      localStorage.setItem(chave, String(Math.round(valor)));
    } catch {
      /* ignore */
    }
  }

  /** No modo diálogo, Esc esconde o painel (mantém o cliente selecionado). */
  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.layoutPainel() === 'dialog' && this.panelVisible() && !this.temModalAberto()) {
      this.panelVisible.set(false);
    }
  }

  /** Há um `app-modal` (upload, preview de documento…) aberto dentro do painel? */
  private temModalAberto(): boolean {
    return !!this.document.querySelector('app-modal .modal__dialog');
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
   * Clique fora fecha o menu "Mais..." e — se o cadeado não estiver travado —
   * também desmarca o cliente (clique fora de uma linha da tabela e do painel).
   */
  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;

    if (this.showMoreActions() && !target?.closest('.clients-actions__menu')) {
      this.showMoreActions.set(false);
    }

    if (this.selectedPersonId() === null || this.editor()?.locked() || this.redimensionando) {
      return;
    }
    if (
      !target ||
      target.closest('tr, app-pessoa-form, app-pessoa-files, app-modal, app-header, .clients-resizer')
    ) {
      return;
    }
    this.selectedPersonId.set(null);
  }

  protected onSaved(client: IPessoa): void {
    this.selectedPersonId.set(client.id);
    // Se o filtro de tipo esconderia o registro salvo, realinha para o tipo dele.
    if (this.tipoCliente() && this.tipoCliente() !== client.pessoa.tipo) {
      this.tipoCliente.set(client.pessoa.tipo);
      this.docDigits.set('');
    }
    this.pageIndex.set(0);
    this.reloadList();
  }

  protected onCleared(): void {
    this.selectedPersonId.set(null);
    this.reloadList();
  }

  /** Ativação/inativação: o registro continua existindo, então mantém a seleção. */
  protected onStatusChanged(client: IPessoa): void {
    this.selectedPersonId.set(client.id);
    this.reloadList();
  }

  protected fecharPasta(): void {
    this.pastaCliente.fechar();
    this.pastaNotice.set(null);
  }

  protected onPastaNotice(evento: PessoaFilesNotice): void {
    const alvo = evento.subject ?? '';
    const textos: Record<PessoaFilesNotice['key'], string> = {
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

  protected clearSearchAndFilters(): void {
    this.searchText.set('');
    this.filters.set({ status: '', hiringMode: '', internalOwner: '' });
    this.incluirInativos.set(false);
    this.limparTipoCliente();
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

    if (field === 'status') {
      // "Inativo" precisa que o backend traga os inativos; "Ativo"/"Todos" voltam ao padrão.
      this.incluirInativos.set(value === 'inactive');
      this.pageIndex.set(0);
    }

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
