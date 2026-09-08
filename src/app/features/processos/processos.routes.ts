import { Routes } from '@angular/router';

export const PROCESSOS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./processos.component').then((m) => m.ProcessosComponent),
  },
];
