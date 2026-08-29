import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import {
  PieChartComponent,
  PieChartSlice,
} from '../../../../shared/components/chart/pie-chart.component';

/** Widget apresentacional: composição da carteira de processos. */
@Component({
  selector: 'app-processes-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PieChartComponent],
  templateUrl: './processes-widget.component.html',
})
export class ProcessesWidgetComponent {
  readonly slices = input.required<PieChartSlice[]>();
  readonly activeCount = input<number>(0);
}
