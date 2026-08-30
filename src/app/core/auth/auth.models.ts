import { HttpErrorResponse } from '@angular/common/http';

/** Corpo enviado para `POST /auth/login`. */
export interface LoginRequest {
  cpf: string;
  password: string;
}

/** Tokens em uso na aplicação (formato interno, normalizado). */
export interface TokenPair {
  access: string;
  refresh: string;
}

/** Resposta de `POST /auth/login` e `POST /auth/refresh` (hub-juridico-api). */
export interface AuthTokensResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
}

/** Normaliza a resposta da API para o formato interno de tokens. */
export function toTokenPair(res: AuthTokensResponse): TokenPair {
  return { access: res.access_token, refresh: res.refresh_token };
}

/** Representação do usuário autenticado — `GET /auth/me`. */
export interface AuthUser {
  id: number;
  name: string;
  email: string;
  cpf: string;
  role: string;
  status: string;
  last_login_at: string | null;
  /** O back-end atual não expõe troca de senha obrigatória; mantido opcional. */
  must_change_password?: boolean;
}

/** Corpo de erro RFC 7807 (ProblemDetail) devolvido pela API. */
export interface ApiErrorBody {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  code?: string;
  trace_id?: string;
}

/** Extrai a mensagem amigável do corpo de erro da API, com fallbacks. */
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
    if (body && typeof body === 'object' && typeof body.detail === 'string' && body.detail.trim()) {
      return body.detail;
    }
  }
  return fallback;
}
