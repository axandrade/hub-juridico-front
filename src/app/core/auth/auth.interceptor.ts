import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';

import { AuthService } from '../services/auth.service';
import { TokenStore } from './token-store';

/** Rotas que não devem receber o header nem disparar o fluxo de refresh. */
const AUTH_BYPASS = ['/auth/login/', '/auth/refresh/'];

function isBypassed(url: string): boolean {
  return AUTH_BYPASS.some((path) => url.includes(path));
}

function withBearer<T>(req: HttpRequest<T>, token: string): HttpRequest<T> {
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

/**
 * Anexa o access token e faz o *silent refresh* transparente:
 * ao receber 401, renova o token uma única vez (via `AuthService.refresh`, que é
 * single-flight) e repete a requisição. Se o refresh falhar, encerra a sessão e
 * manda para o login.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (isBypassed(req.url)) {
    return next(req);
  }

  const tokenStore = inject(TokenStore);
  const auth = inject(AuthService);
  const router = inject(Router);

  const access = tokenStore.accessToken;
  const authReq = access ? withBearer(req, access) : req;

  return next(authReq).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
        return throwError(() => error);
      }

      return auth.refresh().pipe(
        switchMap((token) => next(withBearer(req, token))),
        catchError((refreshError: unknown) => {
          auth.clearSession();
          void router.navigate(['/login'], {
            queryParams: { returnUrl: router.url },
          });
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};
