import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';

/**
 * Único ponto de escrita do agregado Advogado (ver `PATCH /api/v1/advogados/{id}/favorito` no
 * backend) — o resto é 100% leitura via `DomainQueryService`/`<app-domain-table>`.
 */
@Injectable({ providedIn: 'root' })
export class AdvogadoFavoritoService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/advogados`;

  alternar(id: number, favorito: boolean): Observable<void> {
    return this.http.patch<void>(`${this.base}/${id}/favorito`, { favorito });
  }
}
