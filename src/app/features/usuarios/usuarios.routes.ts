import { Routes } from '@angular/router';

export const USUARIOS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./usuario.component').then((m) => m.UsuarioComponent),
  },
];
