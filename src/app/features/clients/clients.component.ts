import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';

import { ModalidadeCliente, IPessoa } from '../../core/models';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { ModalComponent } from '../../shared/components/modal/modal.component';
import {
  PAINEL_LAYOUT_PADRAO,
  PainelLayout,
  ehPainelLayout,
} from './models/painel-layout';
import { PastaClienteService } from './services/pasta-cliente.service';
import { ClientStore } from './services/client-store';
import { ClientFormComponent } from './components/client-form/client-form.component';
import { ClientFilesComponent, ClientFilesNotice } from './components/client-files/client-files.component';
import { ClientRespApi } from './services/client-api.model';
import { emailPrincipal, contatoPrincipal } from '../../core/models';
import { DomainTableComponent, DomainRow } from '../../shared/components/domain-table/domain-table.component';
import { TableColumn } from '../../shared/components/table/table-column.model';
import { TablePinAction } from '../../shared/components/table/table.model';

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

type PageNotice = '' | 'shareReady' | 'importReady' | 'loadError';

@Component({
  selector: 'app-clients',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonComponent,
    ClientFormComponent,
    ModalComponent,
    ClientFilesComponent,
    DomainTableComponent,
  ],
  templateUrl: './clients.component.html',
  styleUrl: './clients.component.scss',
})
export class ClientsComponent {
  private readonly store = inject(ClientStore);
  private readonly document = inject(DOCUMENT);
  protected readonly pastaCliente = inject(PastaClienteService);

  private readonly editor = viewChild(ClientFormComponent);
  private readonly dtClient = viewChild<DomainTableComponent>('dtClient');

  protected readonly selectedPersonId = signal<number | null>(null);
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
  protected readonly showMoreActions = signal(false);
  protected readonly pageNotice = signal<PageNotice>('');

  /** Total de clientes da página atual carregada pelo `app-domain-table`. */
  protected readonly totalClients = computed(() => this.dtClient()?.currentPagination()?.totalElements ?? 0);

  /**
   * Ajustes por coluna (chave em snake_case, casando com o JSON) — reaproveita o `IPessoa` já
   * resolvido pelo `ClientStore` (via `clientFor`) em vez de reconstruir a formatação a partir do
   * JSON cru, então herda de graça a mesma máscara de CPF/CNPJ, o "Cadastrado por" com fallback
   * pro usuário logado etc. que `clientRespToClient` já calcula.
   */
  protected readonly clientColumnOverrides: Record<string, Partial<TableColumn<DomainRow>>> = {
    tipo: {
      header: 'Natureza',
      width: '138px',
      formatter: (_value, row) =>
        this.clientFor(row)?.pessoa.tipo === 'FISICA' ? 'Pessoa física' : 'Pessoa jurídica',
      filter: {
        type: 'select',
        options: [
          { value: '', label: 'Todos' },
          { value: 'FISICA', label: 'Pessoa física' },
          { value: 'JURIDICA', label: 'Pessoa jurídica' },
        ],
      },
    },
    nome: {
      header: 'Nome / Razão',
      width: '240px',
      formatter: (_value, row) => {
        const client = this.clientFor(row);
        return client ? this.clientDisplayName(client) || '-' : '-';
      },
      filter: { type: 'text' },
    },
    cpf: {
      header: 'CPF / CNPJ',
      width: '170px',
      formatter: (_value, row) => {
        const client = this.clientFor(row);
        if (!client) {
          return '-';
        }
        return (client.pessoa.tipo === 'FISICA' ? client.pessoa.cpf : client.pessoa.cnpj) || '-';
      },
      // Campo próprio (`cpf_cnpj`) porque a coluna mescla dois campos do backend (cpf OU cnpj,
      // conforme o tipo) — column.key sozinho não dá pra buscar nos dois ao mesmo tempo.
      filter: { type: 'text', field: 'cpf_cnpj' },
    },
    emails: {
      header: 'E-mail',
      width: '230px',
      formatter: (_value, row) => emailPrincipal(this.clientFor(row)?.pessoa.emails ?? []) || '-',
      // Campo próprio (`email`, singular) porque a coluna mostra só o principal, mas o filtro no
      // backend busca em qualquer e-mail da lista, não só o principal.
      filter: { type: 'text', field: 'email' },
    },
    contatos: {
      header: 'Telefone',
      width: '160px',
      formatter: (_value, row) => contatoPrincipal(this.clientFor(row)?.pessoa.contatos ?? []) || '-',
    },
    status: {
      header: 'Status',
      width: '110px',
      align: 'center',
      format: 'badge',
      badgeDot: true,
      formatter: (_value, row) => (this.clientFor(row)?.dossier.status === 'active' ? 'Ativo' : 'Inativo'),
      badgeTone: (_value, row) => (this.clientFor(row)?.dossier.status === 'active' ? 'success' : 'neutral'),
      // Valores batendo com o enum StatusVinculo do backend (eq exato, não ilike).
      filter: {
        type: 'select',
        options: [
          { value: '', label: 'Todos' },
          { value: 'ATIVO', label: 'Ativo' },
          { value: 'INATIVO', label: 'Inativo' },
        ],
      },
    },
    cadastrado_por_nome: {
      header: 'Cadastrado por',
      width: '150px',
      formatter: (_value, row) => this.clientFor(row)?.dossier.registeredBy || '-',
    },
    modalidade: {
      header: 'Modalidade',
      width: '150px',
      formatter: (_value, row) => this.hiringModeLabel(this.clientFor(row)?.dossier.hiringMode ?? ''),
    },
    responsavel_interno: {
      header: 'Responsável',
      width: '160px',
      formatter: (_value, row) => this.clientFor(row)?.dossier.internalOwner || '-',
    },
  };

  protected readonly clientPinFirst = (row: DomainRow): boolean => this.clientFor(row)?.favorite ?? false;

  protected readonly clientRowClass = (row: DomainRow): Record<string, boolean> => {
    const client = this.clientFor(row);
    return {
      'is-selected': this.selectedPersonId() === Number(row['id']),
      'is-favorite': client?.favorite ?? false,
      'is-inactive': client?.dossier.status === 'inactive',
    };
  };

  protected readonly clientPinAction: TablePinAction<DomainRow> = {
    isActive: (row) => this.clientFor(row)?.favorite ?? false,
    onToggle: (row, event) => this.toggleClientFavorite(row, event),
    ariaLabel: 'Favoritar cliente',
  };

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
  }

  /** Cliente já resolvido (máscara, fallback de "cadastrado por" etc.) pelo `ClientStore`. */
  private clientFor(row: DomainRow): IPessoa | null {
    const id = Number(row['id']);
    return Number.isFinite(id) ? this.store.buscar(id) : null;
  }

  /** Alimenta o `ClientStore` a cada página que o `app-domain-table` busca sozinho. */
  protected onPageLoaded(rows: DomainRow[]): void {
    this.store.definirPaginaGenerica(rows as unknown as ClientRespApi[]);
  }

  protected onLoadError(): void {
    this.pageNotice.set('loadError');
  }

  protected reloadList(): void {
    this.dtClient()?.refresh();
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

  protected toggleClientFavorite(row: DomainRow, event: MouseEvent): void {
    event.stopPropagation();
    const id = Number(row['id']);
    if (Number.isFinite(id)) {
      this.store.alternarFavorito(id);
    }
  }

  protected newRecord(): void {
    this.selectedPersonId.set(null);
    this.panelVisible.set(true);
  }

  protected selectClient(row: DomainRow | null): void {
    const id = row ? Number(row['id']) : null;

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
      target.closest('tr, app-client-form, app-client-files, app-modal, app-header, .clients-resizer')
    ) {
      return;
    }
    this.selectedPersonId.set(null);
  }

  protected onSaved(client: IPessoa): void {
    this.selectedPersonId.set(client.id);
    this.dtClient()?.goToFirstPage();
    this.dtClient()?.refresh();
  }

  protected onCleared(): void {
    this.selectedPersonId.set(null);
    this.dtClient()?.refresh();
  }

  /** Ativação/inativação: o registro continua existindo, então mantém a seleção. */
  protected onStatusChanged(client: IPessoa): void {
    this.selectedPersonId.set(client.id);
    this.dtClient()?.refresh();
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
