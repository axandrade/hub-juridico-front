import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

/**
 * Favoritar é sempre a mesma operação (usuário + recurso + id) — `PATCH /api/v1/{recurso}/{id}/favorito`,
 * corpo `{"favorito": true|false}`, disponível em qualquer controller que precisar disso
 * (`PessoaController`, `AdvogadoController`). `recurso` é o segmento de URL já no plural
 * (`'pessoas'`, `'advogados'`), não o nome singular do agregado.
 */
@Injectable({ providedIn: 'root' })
export class FavoritoService {
  private readonly http = inject(HttpClient);

  alternar(recurso: string, id: number, favorito: boolean): Observable<void> {
    return this.http.patch<void>(
      `${environment.apiBaseUrl}/${recurso}/${id}/favorito`,
      { favorito },
    );
  }
}
