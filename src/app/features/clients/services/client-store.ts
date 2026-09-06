import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, tap } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { IPessoa, TipoPessoa } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { FavoritoService } from '../../../shared/services/favorito.service';
import { PaginaApi, ClientRespApi, StatusVinculoApi } from './client-api.model';
import {
  clientToAtualizarRequest,
  clientToCriarRequest,
  clientRespToClient,
} from './client-mapper';

/**
 * Página pedida ao backend. Filtros do endpoint: `tipo` e `incluirInativos`
 * (`GET /api/v1/pessoas?page&size&tipo&incluirInativos`). Por padrão
 * (`incluirInativos: false`) só vêm pessoas ativas. Os demais filtros da tabela
 * (nome, CPF/CNPJ, e-mail) são aplicados client-side pelo `app-data-table`, só
 * sobre a página de 10 linhas já carregada — o endpoint não tem esses filtros.
 */
export interface ClientListQuery {
  page: number;
  tipo: TipoPessoa | null;
  /** `true` traz também os clientes inativos; padrão é só ativos. */
  incluirInativos: boolean;
}

/**
 * Fonte única da lista de pessoas (clientes) para a feature. Fala com a API
 * `/api/v1/pessoas` (Spring), que pagina de 10 em 10; os componentes só falam
 * com o store. `favorite` é por usuário (`PATCH /pessoas/{id}/favorito`).
 */
@Injectable({ providedIn: 'root' })
export class ClientStore {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly favoritoService = inject(FavoritoService);
  private readonly base = `${environment.apiBaseUrl}/pessoas`;

  /** Tamanho de página fixo do backend (`max-page-size: 10`). */
  static readonly PAGE_SIZE = 10;

  private readonly _clients = signal<IPessoa[]>([]);
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

  private toClient(res: ClientRespApi): IPessoa {
    return clientRespToClient(res, this.auth.user());
  }

  /** Carrega uma página da lista (`tipo` opcional; `FISICA`/`JURIDICA` como no backend). */
  carregar(query: ClientListQuery): Observable<IPessoa[]> {
    let params = new HttpParams()
      .set('page', query.page)
      .set('size', ClientStore.PAGE_SIZE);
    if (query.tipo) {
      params = params.set('tipo', query.tipo);
    }
    if (query.incluirInativos) {
      params = params.set('incluirInativos', true);
    }

    return this.http.get<PaginaApi<ClientRespApi>>(this.base, { params }).pipe(
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
  buscar(id: number | null): IPessoa | null {
    if (id === null) {
      return null;
    }
    return this._clients().find((client) => client.id === id) ?? null;
  }

  /**
   * Ficha completa por id, direto do backend (`GET /api/v1/pessoas/{id}`) — a lista mantida por
   * `carregar` só tem a página atual, então quem for editar a ficha (`ClientFormComponent`)
   * precisa desse fetch à parte pra não depender do cliente estar na página carregada.
   */
  buscarCompleto(id: number): Observable<IPessoa | null> {
    return this.http.get<ClientRespApi>(`${this.base}/${id}`).pipe(
      map((res) => this.toClient(res)),
      catchError(() => of(null)),
    );
  }

  /** `POST` (id 0) ou `PUT` (id existente); devolve o registro do backend. */
  salvar(client: IPessoa): Observable<IPessoa> {
    const request$ =
      client.id > 0
        ? this.http.put<ClientRespApi>(
            `${this.base}/${client.id}`,
            clientToAtualizarRequest(client),
          )
        : this.http.post<ClientRespApi>(this.base, clientToCriarRequest(client));

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

  /**
   * Ativa ou inativa a pessoa via `PATCH /pessoas/{id}/status` (corpo `{"ativo": true|false}`
   * no backend). Não há exclusão: o registro permanece e a resposta traz a pessoa atualizada,
   * que substitui a versão na lista carregada.
   */
  alterarStatus(id: number, status: StatusVinculoApi): Observable<IPessoa> {
    return this.http
      .patch<ClientRespApi>(`${this.base}/${id}/status`, { ativo: status === 'ATIVO' })
      .pipe(
        map((res) => this.toClient(res)),
        tap((atualizado) =>
          this._clients.update((clients) =>
            clients.map((client) => (client.id === atualizado.id ? atualizado : client)),
          ),
        ),
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

    this.favoritoService
      .alternar('pessoas', id, desejado)
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
