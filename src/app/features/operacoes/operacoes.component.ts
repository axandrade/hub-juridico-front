import { ChangeDetectionStrategy, Component } from '@angular/core';

import { DomainModelTableComponent } from '../../shared/components/domain-table/domain-model-table.component';
import { TableColumn } from '../../shared/components/table/table-column.model';

/** Linha crua de `/domain/processo-operacoes` (camelCase) — view só-leitura, ver backend `ProcessoOperacoes`/migration V30. */
interface ProcessoOperacoesRow {
  id: number;
  numeroCnj: string | null;
  acao: string | null;
  status: string | null;
  clientePrincipalNome: string | null;
  contrarioPrincipalNome: string | null;
}

/**
 * Tela de Operações — por enquanto só a tabela (sem busca/painel/favoritar), listando processos
 * com o cliente e a parte contrária marcados como principal. Mesma tabela genérica de Clientes/
 * Advogados (`app-domain-model-table`, busca sozinha em `/domain/{entidade}`), apontada pra
 * `processo-operacoes` — a view só-leitura que resolve os dois nomes (ver `ProcessoOperacoes` no
 * backend), já que `/domain/processo` não tem como (cliente principal é só um id; parte
 * contrária virou lista, sem campo escalar em `Processo`).
 */
@Component({
  selector: 'app-operacoes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DomainModelTableComponent],
  templateUrl: './operacoes.component.html',
  styleUrl: './operacoes.component.scss',
})
export class OperacoesComponent {
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
}
