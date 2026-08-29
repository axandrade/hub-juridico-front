import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import {
  BarChartComponent,
  BarChartSeries,
} from '../../../../shared/components/chart/bar-chart.component';

/** Widget apresentacional: distribuição de tarefas por vencimento/status. */
@Component({
  selector: 'app-tasks-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BarChartComponent],
  templateUrl: './tasks-widget.component.html',
  styleUrl: './tasks-widget.component.scss',
})
export class TasksWidgetComponent {
  readonly labels = input.required<string[]>();
  readonly series = input.required<BarChartSeries[]>();
  readonly total = input<number>(0);
}
