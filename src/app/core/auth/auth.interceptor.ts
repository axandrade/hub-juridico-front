import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';

import { AuthService } from '../services/auth.service';
import { TokenStore } from './token-store';

/**
 * Rotas que não devem receber o header nem disparar o fluxo de refresh. `/api/v1/storage/` é o
 * PUT/GET cru da URL pré-assinada de documentos (ver `LocalStorageController` no backend) — quem
 * autoriza ali é o token da própria URL, não o JWT de autenticação. `graph.microsoft.com` é a
 * mesma ideia, mas pra um host externo: a sessão de upload em blocos do OneDrive (ver
 * `DocumentsService.enviarEmBlocos`) já vem pré-autorizada pela própria URL — mandar o nosso JWT
 * junto só arrisca o Graph rejeitar o Authorization header que ele não espera.
 */
const AUTH_BYPASS = ['/auth/login', '/auth/refresh', '/api/v1/storage/', 'https://graph.microsoft.com/'];

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
