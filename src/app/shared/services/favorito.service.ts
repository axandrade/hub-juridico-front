import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

/**
 * Favoritar é sempre a mesma operação (usuário + entidade + id) pra qualquer agregado exposto no
 * mecanismo genérico de domínio. Não é mais um sub-recurso próprio (`/favorito`) — é só mais um
 * campo do PATCH parcial genérico (`PATCH /api/v1/domain/{tipoEntidade}/{id}`, corpo
 * `{"favorito": true|false}`), que o `DomainQueryController` trata à parte (não é uma coluna de
 * verdade, então não passa pelo `DomainPatch`/reflection). Usado por `ClientStore`
 * (`tipoEntidade: 'pessoa'`) e `AdvogadoComponent` (`'advogado'`); qualquer tela nova com favorito
 * usa isso também, em vez de um serviço próprio por agregado.
 */
@Injectable({ providedIn: 'root' })
export class FavoritoService {
  private readonly http = inject(HttpClient);

  alternar(tipoEntidade: string, id: number, favorito: boolean): Observable<void> {
    return this.http.patch<void>(
      `${environment.apiBaseUrl}/domain/${tipoEntidade}/${id}`,
      { favorito },
    );
  }
}
