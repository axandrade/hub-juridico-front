import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { CardComponent } from '../../../../shared/components/card/card.component';
import { DataTableComponent } from '../../../../shared/components/table/data-table.component';
import { TableColumn } from '../../../../shared/components/table/table-column.model';
import { DashboardService, CategoryTotalRow } from '../../services/dashboard.service';
import { CommitmentsWidgetComponent } from '../commitments-widget/commitments-widget.component';
import { ProcessesWidgetComponent } from '../processes-widget/processes-widget.component';
import { TasksWidgetComponent } from '../tasks-widget/tasks-widget.component';

/**
 * Smart component do painel "Resumo geral": busca os dados via DashboardService
 * e distribui view models para os widgets apresentacionais.
 */
@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AsyncPipe,
    CardComponent,
    DataTableComponent,
    TasksWidgetComponent,
    CommitmentsWidgetComponent,
    ProcessesWidgetComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  private readonly dashboard = inject(DashboardService);

  protected readonly vm$ = this.dashboard.loadDashboard();

  protected readonly pendingColumns: TableColumn<CategoryTotalRow>[] = [
    { key: 'category', header: 'Categoria' },
    { key: 'total', header: 'Total', align: 'right', width: '80px' },
  ];

  protected onNavigate(section: string): void {
    // Placeholder de navegação — as rotas de detalhe ainda não existem.
    console.info(`Abrir seção: ${section}`);
  }
}
