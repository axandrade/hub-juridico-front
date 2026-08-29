import { Routes } from '@angular/router';

import { DashboardService } from './services/dashboard.service';

export const DASHBOARD_ROUTES: Routes = [
  {
    path: '',
    providers: [DashboardService],
    loadComponent: () =>
      import('./components/dashboard-container/dashboard.component').then(
        (m) => m.DashboardComponent,
      ),
  },
];
