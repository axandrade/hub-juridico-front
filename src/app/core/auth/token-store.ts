import { Injectable } from '@angular/core';

import { TokenPair } from './auth.models';

const REFRESH_KEY = 'hub-juridico.refresh';
const PERSIST_KEY = 'hub-juridico.persist';

/**
 * Guarda os tokens de sessão.
 *
 * Segurança:
 * - O **access token** (enviado em toda requisição) fica **só em memória** — nunca
 *   toca `localStorage`/`sessionStorage`, reduzindo a exposição a XSS.
 * - O **refresh token** é persistido para a sessão sobreviver a um reload:
 *   `localStorage` quando "Lembrar-me" está ligado, senão `sessionStorage`.
 *
 * Recomendação de produção: mover o refresh token para um cookie
 * `httpOnly; Secure; SameSite=Strict` — exige suporte a auth por cookie no back-end.
 */
@Injectable({ providedIn: 'root' })
export class TokenStore {
  private access: string | null = null;

  get accessToken(): string | null {
    return this.access;
  }

  /** Persiste o par de tokens. `remember` só é considerado no login (primeiro set). */
  setTokens(pair: TokenPair, remember?: boolean): void {
    this.access = pair.access;

    const persistLocal = remember ?? this.isPersistentSession();
    try {
      const primary = persistLocal ? localStorage : sessionStorage;
      const secondary = persistLocal ? sessionStorage : localStorage;
      primary.setItem(REFRESH_KEY, pair.refresh);
      primary.setItem(PERSIST_KEY, String(persistLocal));
      secondary.removeItem(REFRESH_KEY);
      secondary.removeItem(PERSIST_KEY);
    } catch {
      /* storage indisponível — sessão mantida apenas em memória */
    }
  }

  getRefreshToken(): string | null {
    try {
      return localStorage.getItem(REFRESH_KEY) ?? sessionStorage.getItem(REFRESH_KEY);
    } catch {
      return null;
    }
  }

  clear(): void {
    this.access = null;
    try {
      localStorage.removeItem(REFRESH_KEY);
      localStorage.removeItem(PERSIST_KEY);
      sessionStorage.removeItem(REFRESH_KEY);
      sessionStorage.removeItem(PERSIST_KEY);
    } catch {
      /* nada a limpar */
    }
  }

  private isPersistentSession(): boolean {
    try {
      return localStorage.getItem(PERSIST_KEY) === 'true';
    } catch {
      return false;
    }
  }
}
