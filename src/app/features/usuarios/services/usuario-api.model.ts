/**
 * `UsuarioApi` é a mesma forma pra listagem/`GET /{id}` (via `/domain/user`, mapeada em
 * `usuarioFromDomain` — ver `usuario-service.ts`) e a escrita (`POST /domain/service/
 * user-service/{método}`, resposta é o `UserResponse` de verdade — bean, JSON snake_case via
 * `JacksonConfig` — não o `Map` cru de `/domain/user`).
 */

export type UserRole = 'ADMIN' | 'USER';

export const USER_ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrador',
  USER: 'Usuário',
  VIEWER: 'Visualizador',
};

export interface UsuarioApi {
  id: number;
  /** CPF formatado `000.000.000-00`. */
  cpf: string;
  email: string;
  name: string;
  /** `ADMIN` | `USER` (dados legados podem ter `VIEWER`). */
  role: string;
  /** `ACTIVE` | `INACTIVE` | `SUSPENDED`. */
  status: string;
  ativo: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

/** `args.request` do `POST /domain/service/user-service/criar`. */
export interface UsuarioCriarApi {
  cpf: string;
  email: string;
  name: string;
  role: UserRole;
  senha: string;
}

/** `args.request` do `POST /domain/service/user-service/atualizar`. */
export interface UsuarioAtualizarApi {
  email: string;
  name: string;
  role: UserRole;
}
