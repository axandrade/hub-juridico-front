import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ChartData, ChartOptions } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';

import { ThemeService } from '../../../core/services/theme.service';

export interface BarChartSeries {
  label: string;
  data: number[];
  /** Cor por barra (opcional). Sem isso, usa a sequência botânica. */
  colors?: string[];
}

/** Gráfico de barras genérico com a paleta botânica. */
@Component({
  selector: 'app-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BaseChartDirective],
  styleUrl: './chart.component.scss',
  template: `
    <div class="chart-host">
      <canvas
        baseChart
        type="bar"
        [data]="chartData()"
        [options]="chartOptions()"
      ></canvas>
    </div>
  `,
})
export class BarChartComponent {
  private readonly theme = inject(ThemeService);

  readonly labels = input.required<string[]>();
  readonly series = input.required<BarChartSeries[]>();
  readonly barColors = input<string[]>([]);

  protected readonly chartData = computed<ChartData<'bar'>>(() => {
    const palette = this.theme.getChartColors(this.labels().length);
    return {
      labels: this.labels(),
      datasets: this.series().map((s) => ({
        label: s.label,
        data: s.data,
        backgroundColor:
          s.colors ?? (this.barColors().length ? this.barColors() : palette),
        borderRadius: 4,
        maxBarThickness: 48,
        borderSkipped: false,
      })),
    };
  });

  protected readonly chartOptions = computed(
    () => this.theme.getChartConfig('bar') as ChartOptions<'bar'>,
  );
}
