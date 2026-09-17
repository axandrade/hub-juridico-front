import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { IPessoa } from '../../../core/models';
import { AuthService } from '../../../core/services/auth.service';
import { ClientRespApi, StatusVinculoApi } from './client-api.model';
import { clientRespToClient } from './client-mapper';

/**
 * Ativar/inativar uma pessoa (cliente) já existente, via `/api/v1/pessoas` (Spring). Criar,
 * atualizar e favoritar saíram daqui — vão por `/domain/pessoa-fisica`/`/domain/pessoa-juridica`/
 * `/domain/favorito` (ddd-noap, `@Create`/PATCH genérico em `Pessoa` + `DomainFavoritoService`),
 * direto no `ClientFormComponent` (mesmo padrão do `AdvogadoFormComponent`). A listagem da
 * tabela e a busca da ficha completa também não passam mais por aqui: usam `/domain/pessoa`
 * direto (`DomainModelTableComponent` em `ClientsComponent`; `ClientFormComponent` tem seu
 * próprio `buscarCompleto` via `DomainService`).
 */
@Injectable({ providedIn: 'root' })
export class ClientService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly base = `${environment.apiBaseUrl}/pessoas`;

  /**
   * Cache local das pessoas já vistas nesta sessão (só o que `alterarStatus` devolveu) — usado
   * só pra refletir otimisticamente o status logo após a ação, não é fonte de listagem (isso é
   * `/domain/pessoa`).
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

  proximoId(): number {
    return this._clients().reduce((next, client) => Math.max(next, client.id + 1), 1);
  }
}
