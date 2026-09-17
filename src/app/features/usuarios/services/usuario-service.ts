import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, tap } from 'rxjs';

import { maskCpf } from '../../../core/auth/documentos-br';
import { DomainService, IDomainPage } from '../../../core/services/domain.service';
import { environment } from '../../../../environments/environment';
import {
  UsuarioApi,
  UsuarioAtualizarApi,
  UsuarioCriarApi,
} from './usuario-api.model';

export interface UsuarioListQuery {
  page: number;
  busca?: string;
  incluirInativos: boolean;
}

/** Item cru de `/domain/user` (camelCase) — só os campos que `usuarioFromDomain` usa. */
interface UsuarioDomain {
  id: number;
  cpf: string;
  email: string;
  name: string;
  role: string;
  status: string;
  passwordChangeRequired: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const USUARIO_FIELDS =
  'id,cpf,email,name,role,status,passwordChangeRequired,lastLoginAt,createdAt,updatedAt';

/** Mesma forma de `UserResponse.from` (Java) — `ativo`/`cpf` formatado são derivados aqui. */
function usuarioFromDomain(u: UsuarioDomain): UsuarioApi {
  return {
    id: u.id,
    cpf: maskCpf(u.cpf),
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.status,
    ativo: u.status === 'ACTIVE',
    must_change_password: u.passwordChangeRequired,
    last_login_at: u.lastLoginAt,
    created_at: u.createdAt,
    updated_at: u.updatedAt,
  };
}

/**
 * Fonte da lista de usuários. Listagem e busca por id via `/domain/user` (ddd-noap, só-admin,
 * `User.passwordHash` tem `@JsonIgnore` — nunca vaza), paginado de 10 em 10. Escrita (criar/
 * editar/status/senha) continua em `/api/v1/users` (Spring) — regra de negócio real (proteção
 * contra ficar sem admin, auto-inativação, política de senha). Sem exclusão — `alterarStatus`
 * ativa/inativa.
 */
@Injectable({ providedIn: 'root' })
export class UsuarioService {
  private readonly http = inject(HttpClient);
  private readonly domainService = inject(DomainService);
  private readonly base = `${environment.apiBaseUrl}/users`;

  static readonly PAGE_SIZE = 10;

  private readonly _usuarios = signal<UsuarioApi[]>([]);
  readonly usuarios = this._usuarios.asReadonly();

  private readonly _page = signal(0);
  private readonly _totalPages = signal(1);
  private readonly _totalElements = signal(0);
  private readonly _last = signal(true);

  readonly page = this._page.asReadonly();
  readonly totalPages = this._totalPages.asReadonly();
  readonly totalElements = this._totalElements.asReadonly();
  readonly last = this._last.asReadonly();

  carregar(query: UsuarioListQuery): Observable<UsuarioApi[]> {
    return this.domainService
      .get<IDomainPage<UsuarioDomain>>({
        entityName: 'user',
        page: query.page,
        size: UsuarioService.PAGE_SIZE,
        fields: USUARIO_FIELDS,
        filter: this.buildFilter(query.busca, query.incluirInativos) || undefined,
        sort: 'id',
      })
      .pipe(
        tap((pagina) => {
          this._page.set(pagina.number ?? 0);
          this._totalPages.set(pagina.total_pages ?? 1);
          this._totalElements.set(pagina.total_elements ?? 0);
          this._last.set(pagina.last ?? true);
        }),
        map((pagina) => pagina.content.map(usuarioFromDomain)),
        tap((usuarios) => this._usuarios.set(usuarios)),
      );
  }

  /**
   * Mesmo filtro de `UserRepository.listarComFiltros` (Java, removido): `busca` casa parcialmente
   * em nome / e-mail, e em CPF só pelos dígitos (mínimo 2) — `cpf` na entidade é só dígitos, sem
   * pontuação. `incluirInativos = false` (padrão) traz só `status eq 'ACTIVE'`.
   */
  private buildFilter(busca: string | undefined, incluirInativos: boolean): string {
    const termo = (busca ?? '').trim().replace(/'/g, '');
    const clausulas: string[] = [];
    if (termo) {
      const ors = [`name ilike '*${termo}*'`, `email ilike '*${termo}*'`];
      const digitos = termo.replace(/\D/g, '');
      if (digitos.length >= 2) {
        ors.push(`cpf ilike '*${digitos}*'`);
      }
      clausulas.push(ors.join(' or '));
    }
    if (!incluirInativos) {
      clausulas.push(`status eq 'ACTIVE'`);
    }
    return clausulas.join(' and ');
  }

  buscarCompleto(id: number): Observable<UsuarioApi | null> {
    return this.domainService
      .get<UsuarioDomain>({ entityName: 'user', entityId: id, fields: USUARIO_FIELDS })
      .pipe(map(usuarioFromDomain), catchError(() => of(null)));
  }

  criar(body: UsuarioCriarApi): Observable<UsuarioApi> {
    return this.http.post<UsuarioApi>(this.base, body).pipe(tap((salvo) => this.mesclar(salvo)));
  }

  atualizar(id: number, body: UsuarioAtualizarApi): Observable<UsuarioApi> {
    return this.http
      .put<UsuarioApi>(`${this.base}/${id}`, body)
      .pipe(tap((salvo) => this.mesclar(salvo)));
  }

  alterarStatus(id: number, ativo: boolean): Observable<UsuarioApi> {
    return this.http
      .patch<UsuarioApi>(`${this.base}/${id}/status`, { ativo })
      .pipe(tap((salvo) => this.mesclar(salvo)));
  }

  redefinirSenha(id: number, novaSenha: string): Observable<void> {
    return this.http
      .patch<void>(`${this.base}/${id}/senha`, { nova_senha: novaSenha })
      .pipe(map(() => undefined));
  }

  private mesclar(salvo: UsuarioApi): void {
    this._usuarios.update((lista) =>
      lista.some((u) => u.id === salvo.id)
        ? lista.map((u) => (u.id === salvo.id ? salvo : u))
        : [salvo, ...lista],
    );
  }
}
