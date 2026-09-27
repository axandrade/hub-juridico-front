import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  OnInit,
  TemplateRef,
  computed,
  contentChild,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { PastaClienteService } from '../../../features/clients/services/pasta-cliente.service';
import { PainelLayout } from '../../models/panel-layout';
import { PanelShellController } from '../../panel-shell/panel-shell.controller';
import { ColumnsMenuComponent } from '../columns-menu/columns-menu.component';
import { DomainModelTableComponent } from '../domain-table/domain-model-table.component';
import { TableColumn } from '../table/table-column.model';

/** Linha crua de `/domain/processo-operacoes` (camelCase) — view só-leitura, ver backend `ProcessoOperacoes`/migration V30/V35. */
interface ProcessoOperacoesRow {
  id: number;
  numeroCnj: string | null;
  acao: string | null;
  status: string | null;
  tipo: string | null;
  clientePrincipalNome: string | null;
  contrarioPrincipalNome: string | null;
  clientePrincipalId: number | null;
}

/** Processo selecionado na tabela, cujo conteúdo está aberto no painel lateral. */
export interface ProcessoSelecionado {
  id: number;
  numeroCnj: string | null;
}

/**
 * Contexto do `<ng-template>` que a tela projeta como conteúdo do painel:
 * `<ng-template let-processo let-layout="layoutPainel" let-mudarLayout="mudarLayout" let-fechar="fechar">`.
 */
export interface ProcessoPainelContexto {
  $implicit: ProcessoSelecionado;
  layoutPainel: PainelLayout;
  mudarLayout: (layout: PainelLayout) => void;
  fechar: () => void;
}

/** Campos livremente buscáveis pela caixa de busca — dobrados em RQL (`or`) na filtro(). */
const CAMPOS_BUSCA = ['numeroCnj', 'clientePrincipalNome', 'contrarioPrincipalNome'] as const;

/**
 * Tabela + busca de processos (cliente e parte contrária principais) com painel lateral
 * posicionável — extraída de Operações pra ser reaproveitada por Andamentos Automáticos, que
 * lista exatamente os mesmos processos. Cada tela passa só o título, a `chave` (prefixo das
 * preferências em `localStorage`) e o conteúdo do painel como `<ng-template>` projetado,
 * que recebe o processo selecionado (ver `ProcessoPainelContexto`).
 *
 * Mesma tabela genérica de Clientes/Advogados (`app-domain-model-table`, busca sozinha em
 * `/domain/{entidade}`), apontada pra `processo-operacoes` — a view só-leitura que resolve os dois
 * nomes (ver `ProcessoOperacoes` no backend), já que `/domain/processo` não tem como (cliente
 * principal é só um id; parte contrária virou lista, sem campo escalar em `Processo`).
 *
 * Busca mesmo padrão de Advogados/Processos: RQL `ilike` combinado em `or` sobre número CNJ,
 * cliente principal e contrário principal, resolvido no servidor via `filter` do
 * `DomainModelTableComponent`. Sem "mostrar inativos" aqui — a view já só traz processos ativos.
 *
 * O painel segue o padrão posicionável de Processos/Advogados (`PanelShellController`, dono
 * aqui): divide espaço com a tabela (grid), não fica por cima dela; só o layout `'dialog'`
 * flutua/overlay. Aberto por padrão; sem seleção mostra `textoPainelVazio` em vez do conteúdo.
 */
@Component({
  selector: 'app-processo-lista-painel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DomainModelTableComponent, ColumnsMenuComponent, NgTemplateOutlet],
  templateUrl: './processo-lista-painel.component.html',
  styleUrl: './processo-lista-painel.component.scss',
})
export class ProcessoListaPainelComponent implements OnInit {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly pastaCliente = inject(PastaClienteService);

  /** Título no topo da tela. */
  readonly titulo = input.required<string>();
  /** Identifica a tela nas chaves de `localStorage` (`hub-juridico.{chave}...`) — layout do painel e colunas ficam separados por tela. */
  readonly chave = input.required<string>();
  /** `tipoEntidade` dos favoritos da tabela — ausente, cai no padrão (`processo-operacoes`, o `entityName`). */
  readonly favoritoTipo = input<string | null>(null);
  readonly textoPainelVazio = input('Selecione um processo na tabela para visualizar os detalhes dele aqui.');
  /**
   * Filtro RQL fixo da tela, anexado com `and` depois da busca livre — ex.: Andamentos
   * Automáticos passa `tipo eq 'JUDICIAL'`. Ausente, lista todos os processos ativos. Só
   * condições ligadas por `and` (ver precedência em `buildFilter`).
   */
  readonly filtroFixo = input<string | null>(null);

  /** Conteúdo do painel, projetado pela tela — recebe `ProcessoPainelContexto`. */
  protected readonly painel = contentChild.required(TemplateRef<ProcessoPainelContexto>);

  /** A grade principal — usada pra reload manual e pro resumo de resultados no rodapé. */
  protected readonly grade = viewChild(DomainModelTableComponent<ProcessoOperacoesRow>);

  /** Criado no `ngOnInit` — as chaves de storage dependem do input `chave`. */
  protected panelShell!: PanelShellController;

  protected readonly processoSelecionado = signal<ProcessoSelecionado | null>(null);

  /** Busca livre (número CNJ / cliente principal / contrário principal) — RQL, resolvida no servidor, com debounce. */
  protected readonly busca = signal('');

  private readonly buscaDebounced = toSignal(
    toObservable(this.busca).pipe(debounceTime(300), distinctUntilChanged()),
    { initialValue: this.busca() },
  );

  protected readonly filtro = computed(() => this.buildFilter(this.buscaDebounced(), this.filtroFixo()));

  /** Linha do processo aberto no painel — destaque inequívoco (tinta + fita lateral), mesmo padrão de Clientes/Processos. */
  protected readonly processoRowClass = (row: ProcessoOperacoesRow): Record<string, boolean> => ({
    'is-selected': this.processoSelecionado()?.id === row.id,
  });

  protected readonly columns: TableColumn<ProcessoOperacoesRow>[] = [
    {
      key: 'numeroCnj',
      header: 'Número CNJ',
      width: '190px',
      formatter: (value) => (value ? String(value) : '—'),
    },
    {
      key: 'clientePrincipalNome',
      header: 'Cliente',
      formatter: (value) => (value ? String(value) : '—'),
    },
    {
      key: 'contrarioPrincipalNome',
      header: 'Contrário',
      formatter: (value) => (value ? String(value) : '—'),
    },
    {
      key: 'acao',
      header: 'Ação',
      width: '180px',
      formatter: (value) => (value ? String(value) : '—'),
    },
    {
      key: 'status',
      header: 'Status',
      width: '120px',
      formatter: (value) => (value ? String(value) : '—'),
    },
  ];

  constructor() {
    // Ao sair da tela, esquece o cliente publicado — mesma regra de `ProcessosComponent`.
    this.destroyRef.onDestroy(() => this.pastaCliente.definirCliente(null));
  }

  ngOnInit(): void {
    this.panelShell = new PanelShellController(this.document, {
      storagePrefix: `hub-juridico.${this.chave()}`,
      larguraPadrao: 720,
      larguraMin: 480,
      larguraMax: 1100,
    });
  }

  protected contextoPainel(processo: ProcessoSelecionado): ProcessoPainelContexto {
    return {
      $implicit: processo,
      layoutPainel: this.panelShell.layoutPainel(),
      mudarLayout: (layout) => this.panelShell.setLayoutPainel(layout),
      fechar: () => this.fecharPainel(),
    };
  }

  /**
   * Monta o filtro RQL: `campo1 ilike '*x*' or campo2 ilike '*x*' or campo3 ilike '*x*' and <filtroFixo>`.
   * RQL do ddd-noap não tem parênteses — avalia estritamente da esquerda pra direita — então o
   * filtro fixo vai por último, aplicando-se ao resultado acumulado dos `or` (mesmo padrão do
   * `and ativo eq true` de Advogados).
   */
  private buildFilter(busca: string, filtroFixo: string | null): string {
    const termo = busca.trim().replace(/'/g, '');
    const clausulas: string[] = [];
    if (termo) {
      clausulas.push(CAMPOS_BUSCA.map((campo) => `${campo} ilike '*${termo}*'`).join(' or '));
    }
    if (filtroFixo) {
      clausulas.push(filtroFixo);
    }
    return clausulas.join(' and ');
  }

  protected onBuscaInput(event: Event): void {
    this.busca.set((event.target as HTMLInputElement).value);
  }

  protected limparBusca(): void {
    this.busca.set('');
  }

  protected selecionarProcesso(row: ProcessoOperacoesRow): void {
    this.processoSelecionado.set({ id: row.id, numeroCnj: row.numeroCnj });
    this.panelShell.setPanelVisible(true);
    this.publicarClientePrincipal(row);
  }

  private fecharPainel(): void {
    this.processoSelecionado.set(null);
    this.pastaCliente.definirCliente(null);
  }

  /**
   * Publica o cliente principal do processo selecionado pro diálogo global "Abrir pasta do
   * cliente" — mesma ponte que `ProcessosComponent` usa. Diferente de lá, o nome já vem pronto da
   * view (`clientePrincipalNome`), sem precisar de uma segunda busca.
   */
  private publicarClientePrincipal(row: ProcessoOperacoesRow): void {
    if (row.clientePrincipalId === null) {
      this.pastaCliente.definirCliente(null);
      return;
    }
    this.pastaCliente.definirCliente({ id: row.clientePrincipalId, nome: row.clientePrincipalNome ?? '' });
  }

  protected togglePanel(): void {
    this.panelShell.togglePanel();
  }

  protected reloadList(): void {
    this.grade()?.reload();
  }

  /** No modo diálogo, Esc fecha o diálogo (volta à posição original, mantém o processo selecionado). */
  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.panelShell.layoutPainel() === 'dialog' && this.panelShell.panelVisible()) {
      this.panelShell.fecharDialog();
    }
  }
}
