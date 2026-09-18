import { ChangeDetectionStrategy, Component, computed, signal, viewChild } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { DomainModelTableComponent } from '../../shared/components/domain-table/domain-model-table.component';
import { TableColumn } from '../../shared/components/table/table-column.model';
import { OperacoesProcessoPanelComponent } from './components/operacoes-processo-panel/operacoes-processo-panel.component';

/** Linha crua de `/domain/processo-operacoes` (camelCase) — view só-leitura, ver backend `ProcessoOperacoes`/migration V30. */
interface ProcessoOperacoesRow {
  id: number;
  numeroCnj: string | null;
  acao: string | null;
  status: string | null;
  clientePrincipalNome: string | null;
  contrarioPrincipalNome: string | null;
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
 * Clicar numa linha abre `app-operacoes-processo-panel` (componente próprio, ver ele pros
 * detalhes) com as operações daquele processo.
 */
@Component({
  selector: 'app-operacoes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DomainModelTableComponent, OperacoesProcessoPanelComponent],
  templateUrl: './operacoes.component.html',
  styleUrl: './operacoes.component.scss',
})
export class OperacoesComponent {
  /** A grade principal — usada pra reload manual e pro resumo de resultados no rodapé. */
  protected readonly grade = viewChild(DomainModelTableComponent<ProcessoOperacoesRow>);

  protected readonly processoSelecionado = signal<ProcessoSelecionado | null>(null);

  /** Busca livre (número CNJ / cliente principal / contrário principal) — RQL, resolvida no servidor, com debounce. */
  protected readonly busca = signal('');

  private readonly buscaDebounced = toSignal(
    toObservable(this.busca).pipe(debounceTime(300), distinctUntilChanged()),
    { initialValue: this.busca() },
  );

  protected readonly filtro = computed(() => this.buildFilter(this.buscaDebounced()));

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
  }

  protected fecharPainelOperacoes(): void {
    this.processoSelecionado.set(null);
  }

  protected reloadList(): void {
    this.grade()?.reload();
  }
}
