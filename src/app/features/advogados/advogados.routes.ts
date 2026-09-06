import { Routes } from '@angular/router';

export const ADVOGADOS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./components/advogado/advogado.component').then((m) => m.AdvogadoComponent),
  },
];
