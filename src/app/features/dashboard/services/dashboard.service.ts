import { inject, Injectable } from '@angular/core';
import { combineLatest, map, Observable } from 'rxjs';

import { DATE_FORMAT } from '../../../core/constants/app-constants';
import { DataService } from '../../../core/services/data.service';
import {
  COMMITMENT_STATUS_LABEL,
  ICommitment,
  IProcess,
  ITask,
  PROCESS_STATUS_LABEL,
  ProcessStatus,
  TASK_STATUS_LABEL,
} from '../../../core/models';
import { BarChartSeries } from '../../../shared/components/chart/bar-chart.component';
import { PieChartSlice } from '../../../shared/components/chart/pie-chart.component';
import { formatDate } from '@angular/common';

export interface CategoryTotalRow extends Record<string, unknown> {
  category: string;
  total: number;
}

export interface DashboardViewModel {
  tasks: {
    items: ITask[];
    chartLabels: string[];
    chartSeries: BarChartSeries[];
    pendingRows: CategoryTotalRow[];
  };
  commitments: {
    items: ICommitment[];
    chartLabels: string[];
    chartSeries: BarChartSeries[];
    pendingRows: CategoryTotalRow[];
  };
  processes: {
    items: IProcess[];
    slices: PieChartSlice[];
    activeCount: number;
  };
}

/** Orquestra os dados do painel "Resumo geral" e monta os view models dos widgets. */
@Injectable()
export class DashboardService {
  private readonly data = inject(DataService);

  loadDashboard(): Observable<DashboardViewModel> {
    return combineLatest([
      this.data.getTasks(),
      this.data.getCommitments(),
      this.data.getProcesses(),
    ]).pipe(
      map(([tasks, commitments, processes]) => ({
        tasks: this.buildTasks(tasks),
        commitments: this.buildCommitments(commitments),
        processes: this.buildProcesses(processes),
      })),
    );
  }

  private shortDate(value: Date): string {
    return formatDate(value, DATE_FORMAT.SHORT, DATE_FORMAT.LOCALE);
  }

  private buildTasks(tasks: ITask[]): DashboardViewModel['tasks'] {
    const labels = tasks.map(
      (t) => `${this.shortDate(t.dueDate)} / ${TASK_STATUS_LABEL[t.status]}`,
    );
    return {
      items: tasks,
      chartLabels: labels,
      chartSeries: [{ label: 'Tarefas', data: tasks.map(() => 1) }],
      pendingRows: this.groupByCategory(
        tasks.map((t) => ({
          category: `${t.title} / ${this.shortDate(t.dueDate)}`,
        })),
      ),
    };
  }

  private buildCommitments(items: ICommitment[]): DashboardViewModel['commitments'] {
    const labels = items.map(
      (c) => `${this.shortDate(c.date)} / ${COMMITMENT_STATUS_LABEL[c.status]}`,
    );
    return {
      items,
      chartLabels: labels,
      chartSeries: [{ label: 'Compromissos', data: items.map(() => 1) }],
      pendingRows: this.groupByCategory(
        items.map((c) => ({
          category: `${c.description} / ${this.shortDate(c.date)}`,
        })),
      ),
    };
  }

  private buildProcesses(items: IProcess[]): DashboardViewModel['processes'] {
    const active = items.filter((p) => p.status === ProcessStatus.ACTIVE);
    const grouped = new Map<string, number>();
    for (const process of items) {
      const key = `${process.type} / ${PROCESS_STATUS_LABEL[process.status]}`;
      grouped.set(key, (grouped.get(key) ?? 0) + 1);
    }
    return {
      items,
      activeCount: active.length,
      slices: [...grouped.entries()].map(([label, value]) => ({
        label: `${label} (${value})`,
        value,
      })),
    };
  }

  private groupByCategory(rows: { category: string }[]): CategoryTotalRow[] {
    const grouped = new Map<string, number>();
    for (const row of rows) {
      grouped.set(row.category, (grouped.get(row.category) ?? 0) + 1);
    }
    return [...grouped.entries()].map(([category, total]) => ({ category, total }));
  }
}
