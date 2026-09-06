import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { EstadoCivil } from '../../../core/models';
import { FavoritoService } from '../../../shared/services/favorito.service';
import { AdvogadoApi, PaginaApi } from './advogado-api.model';

/**
 * Filtros do endpoint `GET /api/v1/advogados` — todos reais no servidor (não client-side):
 * `nome`/`cpf`/`oab`/`email`/`cidadeProfissional` casam parcialmente (ilike no backend);
 * `estadoCivil` é igualdade; `incluirInativos` (`false` padrão) traz só `ativo = true`.
 */
export interface AdvogadoListQuery {
  page: number;
  nome?: string;
  cpf?: string;
  oab?: string;
  email?: string;
  cidadeProfissional?: string;
  estadoCivil?: EstadoCivil | null;
  incluirInativos: boolean;
}

/**
 * Fonte única da lista de advogados. Fala com `/api/v1/advogados` (Spring), que pagina de 10
 * em 10. Tela só-leitura por enquanto (sem `salvar`/`criar` no front ainda, embora o backend já
 * suporte CRUD completo) — ver decisão em `advogado-entity` (memória do projeto).
 */
@Injectable({ providedIn: 'root' })
export class AdvogadoStore {
  private readonly http = inject(HttpClient);
  private readonly favoritoService = inject(FavoritoService);
  private readonly base = `${environment.apiBaseUrl}/advogados`;

  static readonly PAGE_SIZE = 10;

  private readonly _advogados = signal<AdvogadoApi[]>([]);
  readonly advogados = this._advogados.asReadonly();

  private readonly _page = signal(0);
  private readonly _totalPages = signal(1);
  private readonly _totalElements = signal(0);
  private readonly _last = signal(true);

  readonly page = this._page.asReadonly();
  readonly totalPages = this._totalPages.asReadonly();
  readonly totalElements = this._totalElements.asReadonly();
  readonly last = this._last.asReadonly();

  /** Carrega uma página da lista com os filtros informados. */
  carregar(query: AdvogadoListQuery): Observable<AdvogadoApi[]> {
    let params = new HttpParams().set('page', query.page).set('size', AdvogadoStore.PAGE_SIZE);
    if (query.nome) {
      params = params.set('nome', query.nome);
    }
    if (query.cpf) {
      params = params.set('cpf', query.cpf);
    }
    if (query.oab) {
      params = params.set('oab', query.oab);
    }
    if (query.email) {
      params = params.set('email', query.email);
    }
    if (query.cidadeProfissional) {
      params = params.set('cidadeProfissional', query.cidadeProfissional);
    }
    if (query.estadoCivil) {
      params = params.set('estadoCivil', query.estadoCivil);
    }
    if (query.incluirInativos) {
      params = params.set('incluirInativos', true);
    }

    return this.http.get<PaginaApi<AdvogadoApi>>(this.base, { params }).pipe(
      tap((pagina) => {
        this._page.set(pagina.pagina ?? 0);
        this._totalPages.set(pagina.total_paginas ?? 1);
        this._totalElements.set(pagina.total_elementos ?? 0);
        this._last.set(pagina.ultima ?? true);
      }),
      map((pagina) => pagina.conteudo ?? []),
      tap((advogados) => this._advogados.set(advogados)),
    );
  }

  /** Advogado já carregado, por id (ou `null`). */
  buscar(id: number | null): AdvogadoApi | null {
    if (id === null) {
      return null;
    }
    return this._advogados().find((advogado) => advogado.id === id) ?? null;
  }

  /**
   * Alterna o favorito do advogado para o usuário logado. Atualiza a lista na hora
   * (otimista), dispara `PATCH /advogados/{id}/favorito` e desfaz se a API falhar.
   * Devolve o estado desejado (pós-clique), ou `null` se o advogado não está carregado.
   */
  alternarFavorito(id: number): boolean | null {
    const atual = this._advogados().find((advogado) => advogado.id === id);
    if (!atual) {
      return null;
    }
    const desejado = !atual.favorito;
    this.setFavoritoLocal(id, desejado);

    this.favoritoService
      .alternar('advogados', id, desejado)
      .subscribe({ error: () => this.setFavoritoLocal(id, !desejado) });

    return desejado;
  }

  private setFavoritoLocal(id: number, favorito: boolean): void {
    this._advogados.update((advogados) =>
      advogados.map((advogado) => (advogado.id === id ? { ...advogado, favorito } : advogado)),
    );
  }
}
