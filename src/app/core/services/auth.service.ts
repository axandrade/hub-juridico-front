import { Injectable, computed, signal } from '@angular/core';
import { Observable, delay, map, of } from 'rxjs';

import { AUTH_DEMO } from '../constants/app-constants';

export interface AuthUser {
  name: string;
  username: string;
  role: string;
}

/**
 * Autenticação da aplicação. Hoje valida credenciais estáticas de demonstração
 * (`admin` / `admin`) com um atraso simulado; a troca por uma chamada real de
 * back-end (HttpClient + token) é transparente para os consumidores.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly latencyMs = 650;
  private readonly _user = signal<AuthUser | null>(this.restore());

  /** Usuário autenticado (ou `null`). */
  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);

  login(username: string, password: string, remember = true): Observable<AuthUser> {
    return of(null).pipe(
      delay(this.latencyMs),
      map(() => {
        const matches =
          username.trim().toLowerCase() === AUTH_DEMO.USERNAME &&
          password === AUTH_DEMO.PASSWORD;

        if (!matches) {
          throw new Error('Usuário ou senha inválidos. Tente novamente.');
        }

        const user: AuthUser = {
          name: 'Dr. Advogado',
          username: AUTH_DEMO.USERNAME,
          role: 'Administrador',
        };
        this.persist(user, remember);
        return user;
      }),
    );
  }

  logout(): void {
    this._user.set(null);
    try {
      localStorage.removeItem(AUTH_DEMO.STORAGE_KEY);
      sessionStorage.removeItem(AUTH_DEMO.STORAGE_KEY);
    } catch {
      /* storage indisponível — nada a limpar */
    }
  }

  private persist(user: AuthUser, remember: boolean): void {
    this._user.set(user);
    try {
      const keep = remember ? localStorage : sessionStorage;
      const drop = remember ? sessionStorage : localStorage;
      keep.setItem(AUTH_DEMO.STORAGE_KEY, JSON.stringify(user));
      drop.removeItem(AUTH_DEMO.STORAGE_KEY);
    } catch {
      /* storage indisponível — sessão mantida apenas em memória */
    }
  }

  private restore(): AuthUser | null {
    try {
      const raw =
        localStorage.getItem(AUTH_DEMO.STORAGE_KEY) ??
        sessionStorage.getItem(AUTH_DEMO.STORAGE_KEY);
      return raw ? (JSON.parse(raw) as AuthUser) : null;
    } catch {
      return null;
    }
  }
}
