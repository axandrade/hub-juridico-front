import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import {
  Observable,
  catchError,
  finalize,
  map,
  of,
  shareReplay,
  switchMap,
  tap,
  throwError,
} from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthUser, LoginResponse, RefreshResponse } from '../auth/auth.models';
import { onlyDigits } from '../auth/cpf';
import { TokenStore } from '../auth/token-store';

/**
 * Autenticação da aplicação contra o hub-juridico-api (JWT).
 *
 * - `login` obtém o par de tokens e carrega o perfil (`/auth/me/`).
 * - `bootstrap` (chamado por `provideAppInitializer`) reidrata a sessão a partir do
 *   refresh token persistido, fazendo um silent refresh.
 * - `refresh` é *single-flight*: vários 401 simultâneos disparam uma única chamada.
 * - `logout` revoga o refresh token no servidor (blacklist) antes de limpar o estado.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly tokenStore = inject(TokenStore);
  private readonly base = `${environment.apiBaseUrl}/auth`;

  private readonly _user = signal<AuthUser | null>(null);

  /** Usuário autenticado (ou `null`). */
  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);
  readonly mustChangePassword = computed(() => this._user()?.must_change_password ?? false);

  private refreshInFlight$: Observable<string> | null = null;

  login(cpf: string, senha: string, remember: boolean): Observable<void> {
    return this.http
      .post<LoginResponse>(`${this.base}/login/`, { cpf: onlyDigits(cpf), senha })
      .pipe(
        tap((res) => this.tokenStore.setTokens(res, remember)),
        switchMap(() => this.loadCurrentUser()),
        map(() => undefined),
      );
  }

  /** Reidrata a sessão no start do app. Nunca rejeita: sem sessão válida → estado limpo. */
  bootstrap(): Observable<void> {
    if (!this.tokenStore.getRefreshToken()) {
      return of(undefined);
    }
    return this.refresh().pipe(
      switchMap(() => this.loadCurrentUser()),
      map(() => undefined),
      catchError(() => {
        this.clearSession();
        return of(undefined);
      }),
    );
  }

  /** Troca o refresh token por um novo access (e novo refresh, por rotação). */
  refresh(): Observable<string> {
    if (this.refreshInFlight$) {
      return this.refreshInFlight$;
    }
    const refresh = this.tokenStore.getRefreshToken();
    if (!refresh) {
      return throwError(() => new Error('Sessão expirada.'));
    }

    this.refreshInFlight$ = this.http
      .post<RefreshResponse>(`${this.base}/refresh/`, { refresh })
      .pipe(
        tap((res) => this.tokenStore.setTokens(res)),
        map((res) => res.access),
        finalize(() => (this.refreshInFlight$ = null)),
        shareReplay(1),
      );
    return this.refreshInFlight$;
  }

  loadCurrentUser(): Observable<AuthUser> {
    return this.http.get<AuthUser>(`${this.base}/me/`).pipe(tap((user) => this._user.set(user)));
  }

  logout(): Observable<void> {
    const refresh = this.tokenStore.getRefreshToken();
    const request$: Observable<unknown> = refresh
      ? this.http.post(`${this.base}/logout/`, { refresh })
      : of(null);
    return request$.pipe(
      catchError(() => of(null)),
      map(() => undefined),
      finalize(() => this.clearSession()),
    );
  }

  changePassword(senhaAtual: string, novaSenha: string): Observable<void> {
    return this.http
      .post(`${environment.apiBaseUrl}/users/me/change-password/`, {
        senha_atual: senhaAtual,
        nova_senha: novaSenha,
      })
      .pipe(
        map(() => undefined),
        tap(() => this.clearSession()),
      );
  }

  clearSession(): void {
    this.tokenStore.clear();
    this.refreshInFlight$ = null;
    this._user.set(null);
  }
}
