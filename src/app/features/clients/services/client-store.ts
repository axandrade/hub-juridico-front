import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, of, tap } from 'rxjs';

import { IClient } from '../../../core/models';
import { DataService } from '../../../core/services/data.service';

/**
 * Fonte única da lista de clientes para a feature. Hoje delega ao `DataService`
 * (mock em memória); a troca por chamadas `HttpClient` contra `/api/v1/pessoas`
 * fica confinada aqui — os componentes só falam com o store.
 */
@Injectable({ providedIn: 'root' })
export class ClientStore {
  private readonly data = inject(DataService);

  private readonly _clients = signal<IClient[]>([]);
  readonly clients = this._clients.asReadonly();

  /** Carrega (ou recarrega) a lista completa. */
  carregarLista(): Observable<IClient[]> {
    return this.data.getClients().pipe(
      map((clients) => clients.map((client) => structuredClone(client))),
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

  /** Insere (id novo) ou substitui (id existente) e devolve o registro persistido. */
  salvar(client: IClient): Observable<IClient> {
    const existe = client.id > 0 && this._clients().some((item) => item.id === client.id);
    const salvo: IClient = structuredClone({
      ...client,
      id: existe ? client.id : this.proximoId(),
      registeredAt: existe ? client.registeredAt : new Date(),
    });

    this._clients.update((clients) =>
      existe
        ? clients.map((item) => (item.id === salvo.id ? structuredClone(salvo) : item))
        : [structuredClone(salvo), ...clients],
    );

    return of(salvo);
  }

  remover(id: number): Observable<void> {
    this._clients.update((clients) => clients.filter((client) => client.id !== id));
    return of(undefined);
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
