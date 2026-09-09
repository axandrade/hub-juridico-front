import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, tap } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  PaginaApi,
  UsuarioApi,
  UsuarioAtualizarApi,
  UsuarioCriarApi,
} from './usuario-api.model';

export interface UsuarioListQuery {
  page: number;
  busca?: string;
  incluirInativos: boolean;
}

/**
 * Fonte da lista de usuários. Fala com `/api/v1/users` (Spring, só-admin), paginado de 10 em 10.
 * CRUD completo, sem exclusão — `alterarStatus` ativa/inativa. `redefinirSenha` é ação do admin.
 */
@Injectable({ providedIn: 'root' })
export class UsuarioService {
  private readonly http = inject(HttpClient);
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
    let params = new HttpParams().set('page', query.page).set('size', UsuarioService.PAGE_SIZE);
    if (query.busca?.trim()) {
      params = params.set('busca', query.busca.trim());
    }
    if (query.incluirInativos) {
      params = params.set('incluirInativos', true);
    }
    return this.http.get<PaginaApi<UsuarioApi>>(this.base, { params }).pipe(
      tap((pagina) => {
        this._page.set(pagina.pagina ?? 0);
        this._totalPages.set(pagina.total_paginas ?? 1);
        this._totalElements.set(pagina.total_elementos ?? 0);
        this._last.set(pagina.ultima ?? true);
      }),
      map((pagina) => pagina.conteudo ?? []),
      tap((usuarios) => this._usuarios.set(usuarios)),
    );
  }

  buscarCompleto(id: number): Observable<UsuarioApi | null> {
    return this.http.get<UsuarioApi>(`${this.base}/${id}`).pipe(catchError(() => of(null)));
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
