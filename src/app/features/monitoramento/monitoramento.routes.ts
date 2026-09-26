import { Routes } from '@angular/router';

export const MONITORAMENTO_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./monitoramento.component').then((m) => m.MonitoramentoComponent),
  },
];
