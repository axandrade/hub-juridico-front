import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { ROUTES } from '../constants/app-constants';
import { AuthService } from '../services/auth.service';

/** Bloqueia rotas internas quando não há sessão — redireciona para o login. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return router.createUrlTree([`/${ROUTES.LOGIN}`], {
      queryParams: { returnUrl: state.url },
    });
  }

  if (auth.mustChangePassword()) {
    return router.createUrlTree([`/${ROUTES.CHANGE_PASSWORD}`]);
  }

  return true;
};

/** Impede que um usuário já autenticado volte para a tela de login. */
export const publicOnlyGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return true;
  }
  return router.createUrlTree([
    `/${auth.mustChangePassword() ? ROUTES.CHANGE_PASSWORD : ROUTES.DASHBOARD}`,
  ]);
};

/**
 * Protege a tela de troca de senha: exige sessão e só faz sentido enquanto o
 * back-end ainda exigir a troca (`must_change_password`).
 */
export const passwordChangeGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return router.createUrlTree([`/${ROUTES.LOGIN}`]);
  }
  if (!auth.mustChangePassword()) {
    return router.createUrlTree([`/${ROUTES.DASHBOARD}`]);
  }
  return true;
};
