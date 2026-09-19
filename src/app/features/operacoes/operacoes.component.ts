import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, computed, inject, signal, viewChild } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { PastaClienteService } from '../clients/services/pasta-cliente.service';
import { DomainModelTableComponent } from '../../shared/components/domain-table/domain-model-table.component';
import { TableColumn } from '../../shared/components/table/table-column.model';
import { PainelLayout } from '../../shared/models/panel-layout';
import { PanelShellController } from '../../shared/panel-shell/panel-shell.controller';
import { OperacoesProcessoPanelComponent } from './components/operacoes-processo-panel/operacoes-processo-panel.component';

/** Linha crua de `/domain/processo-operacoes` (camelCase) — view só-leitura, ver backend `ProcessoOperacoes`/migration V30/V35. */
interface ProcessoOperacoesRow {
  id: number;
  numeroCnj: string | null;
  acao: string | null;
  status: string | null;
  clientePrincipalNome: string | null;
  contrarioPrincipalNome: string | null;
  clientePrincipalId: number | null;
}

/** Processo cujas operações estão abertas no painel lateral. */
interface ProcessoSelecionado {
  id: number;
  numeroCnj: string | null;
}

/** Campos livremente buscáveis pela caixa de busca — dobrados em RQL (`or`) na filtro(). */
const CAMPOS_BUSCA = ['numeroCnj', 'clientePrincipalNome', 'contrarioPrincipalNome'] as const;

/**
 * Tela de Operações — a tabela + busca, listando processos com o cliente e a parte contrária
 * marcados como principal. Mesma tabela genérica de Clientes/Advogados (`app-domain-model-table`,
 * busca sozinha em `/domain/{entidade}`), apontada pra `processo-operacoes` — a view só-leitura
 * que resolve os dois nomes (ver `ProcessoOperacoes` no backend), já que `/domain/processo` não
 * tem como (cliente principal é só um id; parte contrária virou lista, sem campo escalar em
 * `Processo`).
 *
 * Busca mesmo padrão de Advogados/Processos: RQL `ilike` combinado em `or` sobre número CNJ,
 * cliente principal e contrário principal, resolvido no servidor via `filter` do
 * `DomainModelTableComponent`. Sem "mostrar inativos" aqui — a view já só traz processos ativos.
 *
 * Clicar numa linha abre `app-operacoes-processo-panel` — mesmo padrão de painel posicionável de
 * Processos/Advogados (`PanelShellController`, dono aqui, não dentro do painel): divide espaço
 * com a tabela (grid), não fica por cima dela; só o layout `'dialog'` flutua/overlay. Diferente
 * das outras telas, o painel aberto por padrão sem seleção nenhuma mostra um aviso pra escolher um
 * processo em vez do conteúdo — não faz sentido mostrar operações de processo nenhum.
 */
@Component({
  selector: 'app-operacoes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DomainModelTableComponent, OperacoesProcessoPanelComponent],
  templateUrl: './operacoes.component.html',
  styleUrl: './operacoes.component.scss',
})
export class OperacoesComponent {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly pastaCliente = inject(PastaClienteService);

  /** A grade principal — usada pra reload manual e pro resumo de resultados no rodapé. */
  protected readonly grade = viewChild(DomainModelTableComponent<ProcessoOperacoesRow>);

  protected readonly panelShell = new PanelShellController(this.document, {
    storagePrefix: 'hub-juridico.operacoes',
    larguraPadrao: 720,
    larguraMin: 480,
    larguraMax: 1100,
  });

  protected readonly processoSelecionado = signal<ProcessoSelecionado | null>(null);
  /** Painel aberto por padrão (mesma regra de Processos/Advogados) — sem seleção, mostra um aviso pra escolher um processo em vez do conteúdo. */
  protected readonly painelAtivo = this.panelShell.panelVisible;

  /** Busca livre (número CNJ / cliente principal / contrário principal) — RQL, resolvida no servidor, com debounce. */
  protected readonly busca = signal('');

  private readonly buscaDebounced = toSignal(
    toObservable(this.busca).pipe(debounceTime(300), distinctUntilChanged()),
    { initialValue: this.busca() },
  );

  protected readonly filtro = computed(() => this.buildFilter(this.buscaDebounced()));

  /** Linha do processo cujas operações estão abertas no painel — destaque inequívoco (tinta + fita lateral), mesmo padrão de Clientes/Processos. */
  protected readonly processoRowClass = (row: ProcessoOperacoesRow): Record<string, boolean> => ({
    'is-selected': this.processoSelecionado()?.id === row.id,
  });

  protected readonly operacoesColumns: TableColumn<ProcessoOperacoesRow>[] = [
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
    // Ao sair de /operacoes, esquece o cliente publicado — mesma regra de `ProcessosComponent`.
    this.destroyRef.onDestroy(() => this.pastaCliente.definirCliente(null));
  }

  /** Monta o filtro RQL: `campo1 ilike '*x*' or campo2 ilike '*x*' or campo3 ilike '*x*'`. */
  private buildFilter(busca: string): string {
    const termo = busca.trim().replace(/'/g, '');
    return termo ? CAMPOS_BUSCA.map((campo) => `${campo} ilike '*${termo}*'`).join(' or ') : '';
  }

  protected onBuscaInput(event: Event): void {
    this.busca.set((event.target as HTMLInputElement).value);
  }

  protected limparBusca(): void {
    this.busca.set('');
  }

  protected abrirOperacoesDoProcesso(row: ProcessoOperacoesRow): void {
    this.processoSelecionado.set({ id: row.id, numeroCnj: row.numeroCnj });
    this.panelShell.setPanelVisible(true);
    this.publicarClientePrincipal(row);
  }

  protected fecharPainelOperacoes(): void {
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

  protected onLayoutPainelChange(layout: PainelLayout): void {
    this.panelShell.setLayoutPainel(layout);
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
