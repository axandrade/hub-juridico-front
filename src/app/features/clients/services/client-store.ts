import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { IClient, TipoPessoa } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { PaginaApi, PessoaRespApi } from './pessoa-api.model';
import {
  clientToAtualizarRequest,
  clientToCriarRequest,
  pessoaRespToClient,
} from './pessoa-mapper';

/**
 * Página pedida ao backend. Hoje o único filtro do endpoint é `tipo`
 * (`GET /api/v1/pessoas?page&size&tipo`); busca/status seguem client-side.
 */
export interface ClientListQuery {
  page: number;
  tipo: TipoPessoa | null;
}

/**
 * Fonte única da lista de clientes para a feature. Fala com a API
 * `/api/v1/pessoas` (Spring), que pagina de 10 em 10; os componentes só falam
 * com o store. `favorite` é por usuário (`PATCH /pessoas/{id}/favorito`).
 */
@Injectable({ providedIn: 'root' })
export class ClientStore {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly base = `${environment.apiBaseUrl}/pessoas`;

  /** Tamanho de página fixo do backend (`max-page-size: 10`). */
  static readonly PAGE_SIZE = 10;

  private readonly _clients = signal<IClient[]>([]);
  readonly clients = this._clients.asReadonly();

  private readonly _page = signal(0);
  private readonly _totalPages = signal(1);
  private readonly _totalElements = signal(0);
  private readonly _last = signal(true);

  /** Índice da página atual (0-based). */
  readonly page = this._page.asReadonly();
  /** Total de páginas do filtro atual. */
  readonly totalPages = this._totalPages.asReadonly();
  /** Total de clientes do filtro atual (base inteira quando sem filtro). */
  readonly totalElements = this._totalElements.asReadonly();
  /** `true` quando não há próxima página. */
  readonly last = this._last.asReadonly();

  private toClient(res: PessoaRespApi): IClient {
    return pessoaRespToClient(res, this.auth.user());
  }

  /** Carrega uma página da lista (`tipo` opcional; `FISICA`/`JURIDICA` como no backend). */
  carregar(query: ClientListQuery): Observable<IClient[]> {
    let params = new HttpParams()
      .set('page', query.page)
      .set('size', ClientStore.PAGE_SIZE);
    if (query.tipo) {
      params = params.set('tipo', query.tipo);
    }

    return this.http.get<PaginaApi<PessoaRespApi>>(this.base, { params }).pipe(
      tap((page) => {
        this._page.set(page.pagina ?? 0);
        this._totalPages.set(page.total_paginas ?? 1);
        this._totalElements.set(page.total_elementos ?? 0);
        this._last.set(page.ultima ?? true);
      }),
      map((page) => (page.conteudo ?? []).map((res) => this.toClient(res))),
      tap((clients) => this._clients.set(clients)),
    );
  }

  /** Cliente já carregado, por id (ou `null`). */
  buscar(id: number | null): IClient | null {
    if (id === null) {
      return null;
    }
    return this._clients().find((client) => client.id === id) ?? null;
  }

  /** `POST` (id 0) ou `PUT` (id existente); devolve o registro do backend. */
  salvar(client: IClient): Observable<IClient> {
    const request$ =
      client.id > 0
        ? this.http.put<PessoaRespApi>(
            `${this.base}/${client.id}`,
            clientToAtualizarRequest(client),
          )
        : this.http.post<PessoaRespApi>(this.base, clientToCriarRequest(client));

    return request$.pipe(
      map((res) => this.toClient(res)),
      tap((salvo) =>
        this._clients.update((clients) =>
          clients.some((item) => item.id === salvo.id)
            ? clients.map((item) => (item.id === salvo.id ? salvo : item))
            : [salvo, ...clients],
        ),
      ),
    );
  }

  remover(id: number): Observable<void> {
    return this.http
      .delete<void>(`${this.base}/${id}`)
      .pipe(
        tap(() => this._clients.update((clients) => clients.filter((client) => client.id !== id))),
      );
  }

  /**
   * Alterna o favorito da pessoa para o usuário logado. Atualiza a lista na hora
   * (otimista), dispara `PATCH /pessoas/{id}/favorito` e desfaz se a API falhar.
   * Devolve o estado desejado (pós-clique).
   */
  alternarFavorito(id: number): boolean {
    const atual = this._clients().find((client) => client.id === id);
    if (!atual) {
      return false;
    }
    const desejado = !atual.favorite;
    this.setFavoritoLocal(id, desejado);

    this.http
      .patch<void>(`${this.base}/${id}/favorito`, { favorito: desejado })
      .subscribe({ error: () => this.setFavoritoLocal(id, !desejado) });

    return desejado;
  }

  private setFavoritoLocal(id: number, favorito: boolean): void {
    this._clients.update((clients) =>
      clients.map((client) => (client.id === id ? { ...client, favorite: favorito } : client)),
    );
  }

  proximoId(): number {
    return this._clients().reduce((next, client) => Math.max(next, client.id + 1), 1);
  }
}
