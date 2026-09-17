import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { IPessoa } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { FavoritoService } from '../../../shared/services/favorito.service';
import { ClientRespApi, StatusVinculoApi } from './client-api.model';
import { clientRespToClient } from './client-mapper';

/**
 * Ativar/inativar/favoritar uma pessoa (cliente) já existente, via `/api/v1/pessoas` (Spring).
 * Criar e atualizar saíram daqui — vão por `/domain/pessoa-fisica`/`/domain/pessoa-juridica`
 * (ddd-noap, `@Create`/PATCH genérico em `Pessoa`), direto no `ClientFormComponent` (mesmo
 * padrão do `AdvogadoFormComponent`). A listagem da tabela e a busca da ficha completa também
 * não passam mais por aqui: usam `/domain/pessoa` direto (`DomainModelTableComponent` em
 * `ClientsComponent`; `ClientFormComponent` tem seu próprio `buscarCompleto` via `DomainService`).
 */
@Injectable({ providedIn: 'root' })
export class ClientService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly favoritoService = inject(FavoritoService);
  private readonly base = `${environment.apiBaseUrl}/pessoas`;

  /**
   * Cache local das pessoas já vistas nesta sessão (só o que `alterarStatus` devolveu) — usado
   * só pra refletir otimisticamente o favorito/status logo após uma ação, não é fonte de
   * listagem (isso é `/domain/pessoa`).
   */
  private readonly _clients = signal<IPessoa[]>([]);
  readonly clients = this._clients.asReadonly();

  private toClient(res: ClientRespApi): IPessoa {
    return clientRespToClient(res, this.auth.user());
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
   * `/domain/pessoa` (via `ClientFormComponent`), que não passa pelo cache local — só quem
   * chegou aqui via `alterarStatus` está nele. Achado real: antes lia `_clients`, então
   * favoritar um cliente que não tinha acabado de ser reativado nesta sessão virava um no-op silencioso (nunca
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
