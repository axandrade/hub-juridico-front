import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';

import { environment } from '../../../../environments/environment';

/** Item do catálogo "Tipo do anexo" (`GET /api/v1/tipos-anexo`). */
export interface TipoAnexo {
  id: number;
  nome: string;
}

/**
 * Catálogo "Tipo do anexo" (Spring `/api/v1/tipos-anexo`). Muda raramente, então a
 * listagem é cacheada enquanto o serviço vive.
 */
@Injectable({ providedIn: 'root' })
export class TipoAnexoService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/tipos-anexo`;

  private listagem$?: Observable<TipoAnexo[]>;

  listar(): Observable<TipoAnexo[]> {
    this.listagem$ ??= this.http.get<TipoAnexo[]>(this.url).pipe(shareReplay(1));
    return this.listagem$;
  }
}
