import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import { TablePagination } from '../../shared/components/table/table.model';

interface PaginaDominioApi<T> {
  conteudo: T[];
  pagina: number;
  tamanho: number;
  total_elementos: number;
  total_paginas: number;
  ultima: boolean;
}

export interface DomainListResult<T> extends TablePagination {
  items: T[];
}

/**
 * Cliente do endpoint genérico `GET /api/v1/domain/{entityName}` (`DomainQueryController` no
 * backend). Mecanismo paralelo aos stores tipados de cada feature (`ClientStore` etc.) — pensado
 * pra telas simples que só precisam declarar a entidade e os campos, sem escrever um store.
 */
@Injectable({ providedIn: 'root' })
export class DomainQueryService {
  private readonly http = inject(HttpClient);

  list<T>(
    entityName: string,
    opts: { page: number; fields?: string[]; filter?: string[]; sort?: string },
  ): Observable<DomainListResult<T>> {
    let params = new HttpParams().set('page', opts.page).set('size', 10);
    if (opts.fields?.length) {
      params = params.set('fields', opts.fields.join(','));
    }
    if (opts.filter?.length) {
      for (const expressao of opts.filter) {
        params = params.append('filter', expressao);
      }
    }
    if (opts.sort) {
      params = params.set('sort', opts.sort);
    }

    return this.http
      .get<PaginaDominioApi<T>>(`${environment.apiBaseUrl}/domain/${entityName}`, { params })
      .pipe(
        map((resp) => ({
          items: resp.conteudo,
          page: resp.pagina,
          totalPages: resp.total_paginas,
          totalElements: resp.total_elementos,
          last: resp.ultima,
        })),
      );
  }
}
