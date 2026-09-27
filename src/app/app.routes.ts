import { Routes } from '@angular/router';

import { adminGuard, authGuard, passwordChangeGuard, publicOnlyGuard } from './core/guards/auth.guard';
import { LayoutComponent } from './layout/layout.component';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [publicOnlyGuard],
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },
  {
    path: 'trocar-senha',
    canActivate: [passwordChangeGuard],
    title: 'Hub Jurídico · Trocar senha',
    loadComponent: () =>
      import('./features/auth/components/change-password/change-password.component').then(
        (m) => m.ChangePasswordComponent,
      ),
  },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadChildren: () =>
          import('./features/dashboard/dashboard.routes').then((m) => m.DASHBOARD_ROUTES),
        title: 'Hub Jurídico · Dashboard',
      },
      {
        path: 'clientes',
        loadChildren: () =>
          import('./features/clients/clients.routes').then((m) => m.CLIENTS_ROUTES),
        title: 'Hub Jurídico · Clientes',
      },
      {
        path: 'advogados',
        loadChildren: () =>
          import('./features/advogados/advogados.routes').then((m) => m.ADVOGADOS_ROUTES),
        title: 'Hub Jurídico · Advogados',
      },
      {
        path: 'processos',
        loadChildren: () =>
          import('./features/processos/processos.routes').then((m) => m.PROCESSOS_ROUTES),
        title: 'Hub Jurídico · Processos',
      },
      {
        path: 'operacoes',
        loadChildren: () =>
          import('./features/operacoes/operacoes.routes').then((m) => m.OPERACOES_ROUTES),
        title: 'Hub Jurídico · Operações',
      },
      {
        path: 'andamentos-automaticos',
        loadChildren: () =>
          import('./features/andamentos-automaticos/andamentos-automaticos.routes').then(
            (m) => m.ANDAMENTOS_AUTOMATICOS_ROUTES,
          ),
        title: 'Hub Jurídico · Andamentos Automáticos',
      },
      {
        path: 'monitoramento',
        loadChildren: () =>
          import('./features/monitoramento/monitoramento.routes').then(
            (m) => m.MONITORAMENTO_ROUTES,
          ),
        title: 'Hub Jurídico · Monitoramento',
      },
      {
        path: 'usuarios',
        canActivate: [adminGuard],
        loadChildren: () =>
          import('./features/usuarios/usuarios.routes').then((m) => m.USUARIOS_ROUTES),
        title: 'Hub Jurídico · Usuários',
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
