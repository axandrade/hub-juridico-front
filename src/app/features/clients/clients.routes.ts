import { Routes } from '@angular/router';

export const CLIENTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./components/clients-page/clients-page.component').then(
        (m) => m.ClientsPageComponent,
      ),
  },
];
