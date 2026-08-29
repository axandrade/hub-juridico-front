import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import {
  BarChartComponent,
  BarChartSeries,
} from '../../../../shared/components/chart/bar-chart.component';

/** Widget apresentacional: compromissos por data/status. */
@Component({
  selector: 'app-commitments-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BarChartComponent],
  templateUrl: './commitments-widget.component.html',
})
export class CommitmentsWidgetComponent {
  readonly labels = input.required<string[]>();
  readonly series = input.required<BarChartSeries[]>();
}
