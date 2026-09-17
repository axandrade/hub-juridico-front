import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../../environments/environment';
import {
  ProcessoPastaResumo,
  ProcessoPastaResumoApi,
  processoPastaResumoFromApi,
} from './processo-pasta-resumo.model';

/**
 * Fonte da lista de processos vinculados a um magistrado, com o resumo da pasta de cada um
 * (`GET /api/v1/magistrados/{id}/pastas-magistrado/processos`) — alimenta a tabela de visão
 * geral do diálogo "Pasta do magistrado" (mesmo espírito de `ClientesComArquivosService`, mas
 * sem paginação: lista curta, processos de um único magistrado).
 */
@Injectable({ providedIn: 'root' })
export class MagistradoProcessosComArquivosService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  listar(magistradoId: number): Observable<ProcessoPastaResumo[]> {
    return this.http
      .get<ProcessoPastaResumoApi[]>(`${this.base}/magistrados/${magistradoId}/pastas-magistrado/processos`)
      .pipe(map((itens) => itens.map(processoPastaResumoFromApi)));
  }
}
