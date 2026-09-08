import { Routes } from '@angular/router';

export const ADVOGADOS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./advogado.component').then((m) => m.AdvogadoComponent),
  },
];
