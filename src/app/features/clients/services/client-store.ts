import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { IPessoa } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { ClientRespApi, StatusVinculoApi } from './client-api.model';
import {
  clientToAtualizarRequest,
  clientToCriarRequest,
  clientRespToClient,
} from './client-mapper';

/**
 * Fonte única da lista de pessoas (clientes) para a feature. Fala com a API
 * `/api/v1/pessoas` (Spring) pra CRUD/favorito/status; a listagem em si vem do
 * endpoint genérico (`app-domain-table`, ver {@link definirPaginaGenerica}).
 * `favorite` é por usuário (`PATCH /pessoas/{id}/favorito`).
 */
@Injectable({ providedIn: 'root' })
export class ClientStore {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly base = `${environment.apiBaseUrl}/pessoas`;

  private readonly _clients = signal<IPessoa[]>([]);
  readonly clients = this._clients.asReadonly();

  private toClient(res: ClientRespApi): IPessoa {
    return clientRespToClient(res, this.auth.user());
  }

  /**
   * Popula a lista a partir de uma página do endpoint genérico `GET /api/v1/domain/pessoa`
   * (usado pelo `app-domain-table`) — as chaves da resposta já batem com `ClientRespApi` (mesmo
   * JSON snake_case), então é só reaproveitar o mapper. Ponte pro `ClientStore` continuar sendo a
   * fonte de verdade de `buscar`/`salvar`/`alterarStatus`/`alternarFavorito` mesmo quem busca a
   * lista sendo a tabela genérica.
   */
  definirPaginaGenerica(registros: ClientRespApi[]): void {
    this._clients.set(registros.map((res) => this.toClient(res)));
  }

  /** Cliente já carregado, por id (ou `null`). */
  buscar(id: number | null): IPessoa | null {
    if (id === null) {
      return null;
    }
    return this._clients().find((client) => client.id === id) ?? null;
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
   * Ativa ou inativa a pessoa via `PATCH /pessoas/{id}/status`. Não há exclusão:
   * o registro permanece e a resposta traz a pessoa atualizada, que substitui a
   * versão na lista carregada.
   */
  alterarStatus(id: number, status: StatusVinculoApi): Observable<IPessoa> {
    return this.http
      .patch<ClientRespApi>(`${this.base}/${id}/status`, { status })
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
