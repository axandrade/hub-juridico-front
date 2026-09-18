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
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { contatoPrincipal, emailPrincipal, IContato, IEmail, IPessoa, TipoPessoa } from '../../core/models';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { DomainModelTableComponent } from '../../shared/components/domain-table/domain-model-table.component';
import { PanelShellController } from '../../shared/panel-shell/panel-shell.controller';
import { PastaClienteService } from './services/pasta-cliente.service';
import { TableColumn } from '../../shared/components/table/table-column.model';
import { ClientFormComponent } from './components/client-form/client-form.component';

/**
 * Linha crua de `/domain/pessoa` (camelCase, ver `DomainService`) — `Pessoa` é
 * `@Inheritance(JOINED)` (`PessoaFisica`/`PessoaJuridica`), e o ddd-noap mescla os campos do
 * subtipo concreto direto no mesmo objeto (marcados por `instanceOf`, que não pedimos aqui —
 * discriminamos física/jurídica pelo próprio filtro RQL, ver `buildFilter`). Só os campos que
 * a grade usa — não é o `IDadosPessoa` completo do formulário.
 *
 * `emails`/`contatos` pedem só `principal`/`endereco`/`valor` — o suficiente pra achar o
 * principal com `emailPrincipal()`/`contatoPrincipal()` (mesma lógica de
 * `Pessoa.getEmailPrincipal()`/`getContatoPrincipal()` no backend). Eram `@ElementCollection`
 * de `@Embeddable` sem `@Id`, o que quebrava o dedup de coleção do ddd-noap
 * (`ResultProcessor`/`PropertyId.getIdFieldName`) — corrigido lá lendo a coleção direto da
 * entidade raiz em vez de tentar consolidar por um id inexistente.
 */
interface PessoaListRow {
  id: number;
  status: 'ATIVO' | 'INATIVO';
  nome?: string | null;
  cpf?: string | null;
  razaoSocial?: string | null;
  nomeFantasia?: string | null;
  cnpj?: string | null;
  emails?: IEmail[];
  contatos?: IContato[];
}

/** Campos livremente buscáveis pela caixa de busca — dobrados em RQL (`or`) na buildFilter(). */
const CAMPOS_BUSCA = ['nome', 'razaoSocial', 'nomeFantasia', 'cpf', 'cnpj'] as const;

/**
 * Listagem de Clientes (`Pessoa` no backend) via `/domain/pessoa` (ddd-noap) — igual ao piloto
 * de Advogados. O painel de criar/editar (`client-form`, com abas/endereço/representantes/
 * arquivos) e o `PessoaController`/`PessoaService` continuam exatamente como estavam: são
 * regra de negócio complexa demais pra esse CRUD genérico, migrar só a grade já prova o ponto.
 *
 * "Cadastrado por" saiu da grade: era um nome resolvido via join no backend
 * (`PessoaService.listarPagina`), não um campo literal da entidade — o genérico só devolve o
 * que está de fato na entidade (`cadastradoPorId`, um id cru, não o nome).
 */
@Component({
  selector: 'app-clients',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, ClientFormComponent, DomainModelTableComponent],
  templateUrl: './clients.component.html',
  styleUrl: './clients.component.scss',
})
export class ClientsComponent {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly pastaCliente = inject(PastaClienteService);

  private readonly editor = viewChild(ClientFormComponent);
  /** A grade de clientes — o botão "Colunas" da barra de ações comanda esta instância. */
  protected readonly clientsTable = viewChild(DomainModelTableComponent<PessoaListRow>);

  protected readonly selectedPersonId = signal<number | null>(null);
  /** Posição/tamanho/visibilidade do painel — ver `PanelShellController`. */
  protected readonly panelShell = new PanelShellController(this.document, {
    storagePrefix: 'hub-juridico.clients',
  });

  /** `true` traz também clientes inativos — reflete exatamente o `incluirInativos` do backend. */
  protected readonly incluirInativos = signal(false);
  /** Busca livre (nome/razão, CPF/CNPJ) — resolvida no servidor, com debounce. */
  protected readonly busca = signal('');
  /** Filtro de natureza (chips) — `''` = todos. Física/jurídica discriminado por `cpf eq/ne null`. */
  protected readonly tipoFiltro = signal<TipoPessoa | ''>('');

  /** Última página carregada pela grade — usado só pra resolver o nome no diálogo "pasta do cliente". */
  private readonly lastLoadedRows = signal<PessoaListRow[]>([]);

  private readonly buscaDebounced = toSignal(
    toObservable(this.busca).pipe(debounceTime(300), distinctUntilChanged()),
    { initialValue: this.busca() },
  );

  protected readonly filtro = computed(() =>
    this.buildFilter(this.buscaDebounced(), this.tipoFiltro(), this.incluirInativos()),
  );

  protected readonly clientColumns: TableColumn<PessoaListRow>[] = [
    {
      key: 'natureza',
      header: 'Natureza',
      width: '138px',
      formatter: (_value, row) => (row.cpf ? 'Pessoa física' : 'Pessoa jurídica'),
    },
    {
      key: 'nome',
      header: 'Nome / Razão',
      width: '240px',
      formatter: (_value, row) => this.clientDisplayName(row) || '-',
    },
    {
      key: 'documento',
      header: 'CPF / CNPJ',
      width: '170px',
      formatter: (_value, row) => (row.cpf || row.cnpj) || '-',
    },
    {
      key: 'email',
      header: 'E-mail',
      width: '220px',
      formatter: (_value, row) => emailPrincipal(row.emails ?? []) || '-',
    },
    {
      key: 'contato',
      header: 'Telefone',
      width: '160px',
      formatter: (_value, row) => contatoPrincipal(row.contatos ?? []) || '-',
    },
    {
      key: 'status',
      header: 'Status',
      width: '110px',
      align: 'center',
      format: 'badge',
      badgeDot: true,
      formatter: (_value, row) => (row.status === 'ATIVO' ? 'Ativo' : 'Inativo'),
      badgeTone: (_value, row) => (row.status === 'ATIVO' ? 'success' : 'neutral'),
    },
  ];

  protected readonly clientRowClass = (row: PessoaListRow): Record<string, boolean> => ({
    'is-selected': this.selectedPersonId() === row.id,
    'is-inactive': row.status !== 'ATIVO',
  });

  /** Cliente inativo não favorita nem fixa no topo — ver `DomainModelTableComponent`. */
  protected readonly clientIsActive = (row: PessoaListRow): boolean => row.status === 'ATIVO';

  constructor() {
    // Publica o cliente selecionado para o diálogo "Abrir pasta do cliente" (global, no layout).
    effect(() => {
      const id = this.selectedPersonId();
      const row = id !== null ? this.lastLoadedRows().find((r) => r.id === id) : null;
      this.pastaCliente.definirCliente(
        row
          ? { id: row.id, nome: this.clientDisplayName(row) }
          : id !== null && id > 0
            ? { id, nome: '' }
            : null,
      );
    });

    // Ao sair de /clientes, esquece a seleção: em qualquer outra tela o diálogo abre na visão geral.
    this.destroyRef.onDestroy(() => this.pastaCliente.definirCliente(null));
  }

  /**
   * Monta o filtro RQL: `campo1 ilike '*x*' or campo2 ilike '*x*' ... and (cpf eq|ne null)
   * and status eq 'ATIVO'`. RQL do ddd-noap não tem parênteses/precedência — avaliação
   * estrita da esquerda pra direita — então todos os `or` vêm primeiro, os `and` por último,
   * pra virar `((ORs) AND tipo) AND status`, não o contrário.
   */
  private buildFilter(busca: string, tipo: TipoPessoa | '', incluirInativos: boolean): string {
    const termo = busca.trim().replace(/'/g, '');
    const clausulas: string[] = [];
    if (termo) {
      clausulas.push(CAMPOS_BUSCA.map((campo) => `${campo} ilike '*${termo}*'`).join(' or '));
    }
    if (tipo === 'FISICA') {
      clausulas.push('cpf ne null');
    } else if (tipo === 'JURIDICA') {
      clausulas.push('cpf eq null');
    }
    if (!incluirInativos) {
      clausulas.push("status eq 'ATIVO'");
    }
    return clausulas.join(' and ');
  }

  protected onDataLoaded(rows: PessoaListRow[]): void {
    this.lastLoadedRows.set(rows);
  }

  protected onBuscaInput(event: Event): void {
    this.busca.set((event.target as HTMLInputElement).value);
  }

  protected limparBusca(): void {
    this.busca.set('');
  }

  /** Chip de natureza (`''` = Todos). Seleção direta, estilo rádio. */
  protected selecionarTipo(tipo: TipoPessoa | ''): void {
    this.tipoFiltro.set(tipo);
  }

  protected onToggleIncluirInativos(event: Event): void {
    this.incluirInativos.set((event.target as HTMLInputElement).checked);
  }

  protected reloadList(): void {
    this.clientsTable()?.reload();
  }

  /** No modo diálogo, Esc fecha o diálogo (volta à posição original, mantém o cliente selecionado). */
  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (
      this.panelShell.layoutPainel() === 'dialog' &&
      this.panelShell.panelVisible() &&
      !this.temModalAberto()
    ) {
      this.panelShell.fecharDialog();
    }
  }

  /** Há um `app-modal` (upload, preview de documento…) aberto dentro do painel? */
  private temModalAberto(): boolean {
    return !!this.document.querySelector('app-modal .modal__dialog');
  }

  protected newRecord(): void {
    this.selectedPersonId.set(null);
    this.panelShell.setPanelVisible(true);
  }

  protected selectClient(row: PessoaListRow | null): void {
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
    this.clientsTable()?.reload();
  }

  protected onCleared(): void {
    this.selectedPersonId.set(null);
    this.clientsTable()?.reload();
  }

  /** Ativação/inativação: o registro continua existindo, então mantém a seleção. */
  protected onStatusChanged(client: IPessoa): void {
    this.selectedPersonId.set(client.id);
    this.clientsTable()?.reload();
  }

  private clientDisplayName(row: PessoaListRow): string {
    return row.cpf ? (row.nome ?? '').trim() : (row.razaoSocial || row.nomeFantasia || '').trim();
  }
}
