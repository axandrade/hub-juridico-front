import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { ROUTES } from '../constants/app-constants';
import { AuthService } from '../services/auth.service';

/** Bloqueia rotas internas quando não há sessão — redireciona para o login. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree([`/${ROUTES.LOGIN}`], {
    queryParams: { returnUrl: state.url },
  });
};

/** Impede que um usuário já autenticado volte para a tela de login. */
export const publicOnlyGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.isAuthenticated() ? router.createUrlTree([`/${ROUTES.DASHBOARD}`]) : true;
};
