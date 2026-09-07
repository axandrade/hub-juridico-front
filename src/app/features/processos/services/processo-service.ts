import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { FavoritoService } from '../../../shared/services/favorito.service';
import { PaginaApi, ProcessoResumoApi, TipoProcesso } from './processo-api.model';

/**
 * Filtros do `GET /api/v1/processos` — todos reais no servidor: `busca` casa parcialmente em
 * número CNJ / status / natureza / ação / cidade; `tipo` é igualdade; `incluirInativos` (`false`
 * padrão) traz só `ativo = true`.
 */
export interface ProcessoListQuery {
  page: number;
  busca?: string;
  tipo?: TipoProcesso | null;
  incluirInativos: boolean;
}

/**
 * Fonte da lista de processos. Fala com `/api/v1/processos` (Spring), paginado de 10 em 10.
 * Mesmo desenho de `AdvogadoService` — o CRUD de escrita (criar/editar/status) entra junto com o
 * formulário do painel.
 */
@Injectable({ providedIn: 'root' })
export class ProcessoService {
  private readonly http = inject(HttpClient);
  private readonly favoritoService = inject(FavoritoService);
  private readonly base = `${environment.apiBaseUrl}/processos`;

  static readonly PAGE_SIZE = 10;

  private readonly _processos = signal<ProcessoResumoApi[]>([]);
  readonly processos = this._processos.asReadonly();

  private readonly _page = signal(0);
  private readonly _totalPages = signal(1);
  private readonly _totalElements = signal(0);
  private readonly _last = signal(true);

  readonly page = this._page.asReadonly();
  readonly totalPages = this._totalPages.asReadonly();
  readonly totalElements = this._totalElements.asReadonly();
  readonly last = this._last.asReadonly();

  /** Carrega uma página da lista com os filtros informados. */
  carregar(query: ProcessoListQuery): Observable<ProcessoResumoApi[]> {
    let params = new HttpParams().set('page', query.page).set('size', ProcessoService.PAGE_SIZE);
    if (query.busca?.trim()) {
      params = params.set('busca', query.busca.trim());
    }
    if (query.tipo) {
      params = params.set('tipo', query.tipo);
    }
    if (query.incluirInativos) {
      params = params.set('incluirInativos', true);
    }

    return this.http.get<PaginaApi<ProcessoResumoApi>>(this.base, { params }).pipe(
      tap((pagina) => {
        this._page.set(pagina.pagina ?? 0);
        this._totalPages.set(pagina.total_paginas ?? 1);
        this._totalElements.set(pagina.total_elementos ?? 0);
        this._last.set(pagina.ultima ?? true);
      }),
      map((pagina) => pagina.conteudo ?? []),
      tap((processos) => this._processos.set(processos)),
    );
  }

  /**
   * Alterna o favorito do processo (otimista): atualiza a lista na hora, dispara
   * `PATCH /processos/{id}/favorito` e desfaz se a API falhar. Devolve o estado desejado, ou
   * `null` se o processo não está carregado.
   */
  alternarFavorito(id: number): boolean | null {
    const atual = this._processos().find((p) => p.id === id);
    if (!atual) {
      return null;
    }
    const desejado = !atual.favorito;
    this.setFavoritoLocal(id, desejado);

    this.favoritoService
      .alternar('processos', id, desejado)
      .subscribe({ error: () => this.setFavoritoLocal(id, !desejado) });

    return desejado;
  }

  private setFavoritoLocal(id: number, favorito: boolean): void {
    this._processos.update((processos) =>
      processos.map((p) => (p.id === id ? { ...p, favorito } : p)),
    );
  }
}
