import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ChartData, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

import { ThemeService } from '../../../core/services/theme.service';

export interface PieChartSlice {
  label: string;
  value: number;
  color?: string;
}

/** Gráfico de pizza / rosca genérico com a paleta botânica. */
@Component({
  selector: 'app-pie-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BaseChartDirective],
  styleUrl: './chart.component.scss',
  template: `
    <div class="chart-host">
      <canvas baseChart type="doughnut" [data]="chartData()" [options]="chartOptions()"></canvas>
    </div>
  `,
})
export class PieChartComponent {
  private readonly theme = inject(ThemeService);

  readonly slices = input.required<PieChartSlice[]>();
  readonly doughnut = input<boolean>(true);

  protected readonly chartData = computed<ChartData<'doughnut'>>(() => {
    const slices = this.slices();
    const palette = this.theme.getChartColors(slices.length);
    return {
      labels: slices.map((s) => s.label),
      datasets: [
        {
          data: slices.map((s) => s.value),
          backgroundColor: slices.map((s, i) => s.color ?? palette[i]),
          borderColor: '#fbfaf3',
          borderWidth: 2,
          hoverOffset: 6,
        },
      ],
    };
  });

  protected readonly chartOptions = computed<ChartOptions<'doughnut'>>(() => {
    const base = this.theme.getChartConfig('doughnut') as ChartOptions<'doughnut'>;
    return { ...base, cutout: this.doughnut() ? '62%' : 0 };
  });
}
