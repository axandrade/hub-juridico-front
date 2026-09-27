import { Routes } from '@angular/router';

export const ANDAMENTOS_AUTOMATICOS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./andamentos-automaticos.component').then((m) => m.AndamentosAutomaticosComponent),
  },
];
