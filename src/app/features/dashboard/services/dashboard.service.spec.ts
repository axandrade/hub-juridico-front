import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { DataService } from '../../../core/services/data.service';
import { DashboardService } from './dashboard.service';

registerLocaleData(localePt);

describe('DashboardService', () => {
  let service: DashboardService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [DataService, DashboardService] });
    service = TestBed.inject(DashboardService);
  });

  it('monta o view model dos três blocos', async () => {
    const vm = await firstValueFrom(service.loadDashboard());

    expect(vm.tasks.items.length).toBeGreaterThan(0);
    expect(vm.tasks.chartLabels.length).toBe(vm.tasks.chartSeries[0].data.length);
    expect(vm.commitments.chartSeries[0].label).toBe('Compromissos');
    expect(vm.processes.activeCount).toBeGreaterThan(0);
    expect(vm.processes.slices.reduce((sum, s) => sum + s.value, 0)).toBe(
      vm.processes.items.length,
    );
  });
});
