import { HttpErrorResponse } from '@angular/common/http';

/** Corpo enviado para `POST /auth/login/`. */
export interface LoginRequest {
  login: string;
  senha: string;
}

/** Par de tokens JWT devolvido por login e refresh. */
export interface TokenPair {
  access: string;
  refresh: string;
}

/** Resposta de `POST /auth/login/`. */
export interface LoginResponse extends TokenPair {
  must_change_password: boolean;
}

/** Resposta de `POST /auth/refresh/` (o refresh é rotacionado pelo back-end). */
export type RefreshResponse = TokenPair;

export interface AuthRole {
  name: string;
  permissions: string[];
}

/** Representação do usuário autenticado — `GET /auth/me/`. */
export interface AuthUser {
  id: string;
  nome: string;
  login: string;
  email: string;
  cpf: string;
  is_active: boolean;
  is_staff: boolean;
  must_change_password: boolean;
  role: AuthRole;
  created_at: string;
  updated_at: string;
  last_login: string | null;
}

/** Envelope de erro padrão da API (`core/middleware/exception_handler.py`). */
export interface ApiErrorBody {
  erro: {
    codigo: string;
    mensagem: string;
    detalhes?: unknown;
  };
}

/** Extrai a mensagem amigável do envelope de erro da API, com fallbacks. */
export function extractApiErrorMessage(
  err: unknown,
  fallback = 'Não foi possível completar a operação. Tente novamente.',
): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) {
      return 'Servidor indisponível. Verifique sua conexão e tente novamente.';
    }
    const body = err.error as Partial<ApiErrorBody> | string | null;
    if (typeof body === 'string' && body.trim()) {
      return body;
    }
    if (body && typeof body === 'object' && 'erro' in body && body.erro?.mensagem) {
      return body.erro.mensagem;
    }
  }
  return fallback;
}
