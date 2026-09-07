import { Routes } from '@angular/router';

export const PROCESSOS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./components/processos/processos.component').then((m) => m.ProcessosComponent),
  },
];
