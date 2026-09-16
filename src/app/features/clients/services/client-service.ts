import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, tap } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { IPessoa } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { FavoritoService } from '../../../shared/services/favorito.service';
import { ClientRespApi, StatusVinculoApi } from './client-api.model';
import {
  clientToAtualizarRequest,
  clientToCriarRequest,
  clientRespToClient,
} from './client-mapper';

/**
 * CRUD de uma pessoa (cliente) por vez — criar/atualizar/buscar ficha completa/ativar-inativar/
 * favoritar, via `/api/v1/pessoas` (Spring). A listagem da tabela não passa mais por aqui: usa
 * `/domain/pessoa` direto (`DomainModelTableComponent`, ver `ClientsComponent`).
 */
@Injectable({ providedIn: 'root' })
export class ClientService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly favoritoService = inject(FavoritoService);
  private readonly base = `${environment.apiBaseUrl}/pessoas`;

  /**
   * Cache local das pessoas já vistas nesta sessão (só o que `salvar`/`alterarStatus` devolveram)
   * — usado só pra refletir otimisticamente o favorito/status logo após uma ação, não é fonte de
   * listagem (isso é `/domain/pessoa`).
   */
  private readonly _clients = signal<IPessoa[]>([]);
  readonly clients = this._clients.asReadonly();

  private toClient(res: ClientRespApi): IPessoa {
    return clientRespToClient(res, this.auth.user());
  }

  /**
   * Ficha completa por id, direto do backend (`GET /api/v1/pessoas/{id}`) — a tabela
   * (`/domain/pessoa`) só traz os campos que a grade exibe, então quem for editar a ficha
   * (`ClientFormComponent`) precisa desse fetch à parte.
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
   *
   * Recebe o favorito atual explícito (não lê de `_clients`): a ficha aberta no painel vem de
   * `buscarCompleto`, que não passa pelo cache local — só quem chegou aqui via `salvar`/
   * `alterarStatus` está nele. Achado real: antes lia `_clients`, então favoritar um cliente
   * que não tinha acabado de ser salvo/reativado nesta sessão virava um no-op silencioso (nunca
   * chamava a API) desde que a listagem passou a vir de `/domain/pessoa` em vez de `carregar()`.
   */
  alternarFavorito(id: number, favoritoAtual: boolean): boolean {
    const desejado = !favoritoAtual;
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
