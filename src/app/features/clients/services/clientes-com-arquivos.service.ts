import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { PaginaApi } from './client-api.model';
import {
  ClientePastaResumo,
  ClientePastaResumoApi,
  resumoFromApi,
} from './cliente-pasta-resumo.model';

/**
 * Fonte da lista de clientes que já têm arquivos (`GET /api/v1/pastas/clientes`, paginado de 10
 * em 10 no backend). Só apresentação — o componente pede uma página, o serviço guarda o estado de
 * paginação. Mesma forma do `ClientService`.
 */
@Injectable({ providedIn: 'root' })
export class ClientesComArquivosService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/pastas/clientes`;

  private readonly _itens = signal<ClientePastaResumo[]>([]);
  private readonly _page = signal(0);
  private readonly _totalPages = signal(1);
  private readonly _totalElements = signal(0);
  private readonly _last = signal(true);

  readonly itens = this._itens.asReadonly();
  readonly page = this._page.asReadonly();
  readonly totalPages = this._totalPages.asReadonly();
  readonly totalElements = this._totalElements.asReadonly();
  readonly last = this._last.asReadonly();

  /** Carrega uma página (0-based) e atualiza os signals. */
  carregar(page: number): Observable<ClientePastaResumo[]> {
    const params = new HttpParams().set('page', page);
    return this.http.get<PaginaApi<ClientePastaResumoApi>>(this.url, { params }).pipe(
      tap((pagina) => {
        this._page.set(pagina.pagina ?? 0);
        this._totalPages.set(pagina.total_paginas ?? 1);
        this._totalElements.set(pagina.total_elementos ?? 0);
        this._last.set(pagina.ultima ?? true);
      }),
      map((pagina) => (pagina.conteudo ?? []).map(resumoFromApi)),
      tap((itens) => this._itens.set(itens)),
    );
  }
}
