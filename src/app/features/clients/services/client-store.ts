import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { IClient } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { PaginaApi, PessoaRespApi } from './pessoa-api.model';
import {
  clientToAtualizarRequest,
  clientToCriarRequest,
  pessoaRespToClient,
} from './pessoa-mapper';

/**
 * Fonte única da lista de clientes para a feature. Fala com a API
 * `/api/v1/pessoas` (Spring); os componentes só falam com o store. O `favorite`
 * é frontend-only (sem campo no backend).
 */
@Injectable({ providedIn: 'root' })
export class ClientStore {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly base = `${environment.apiBaseUrl}/pessoas`;

  private readonly _clients = signal<IClient[]>([]);
  readonly clients = this._clients.asReadonly();

  private toClient(res: PessoaRespApi): IClient {
    return pessoaRespToClient(res, this.auth.user());
  }

  /** Carrega (ou recarrega) a lista. Paginação do backend: pego uma página grande. */
  carregarLista(): Observable<IClient[]> {
    return this.http.get<PaginaApi<PessoaRespApi>>(this.base, { params: { size: 200 } }).pipe(
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

  /** Favorito é frontend-only (sem backend). */
  alternarFavorito(id: number): boolean {
    let favorito = false;
    this._clients.update((clients) =>
      clients.map((client) => {
        if (client.id !== id) {
          return client;
        }
        favorito = !client.favorite;
        return { ...client, favorite: favorito };
      }),
    );
    return favorito;
  }

  proximoId(): number {
    return this._clients().reduce((next, client) => Math.max(next, client.id + 1), 1);
  }
}
