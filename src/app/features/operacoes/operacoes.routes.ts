import { Routes } from '@angular/router';

export const OPERACOES_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./operacoes.component').then((m) => m.OperacoesComponent),
  },
];
