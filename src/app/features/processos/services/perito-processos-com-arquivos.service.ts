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
 * Cópia fiel de {@link MagistradoProcessosComArquivosService} (mesmo comportamento, por decisão do
 * usuário) — fonte da lista de processos vinculados a um perito, com o resumo da pasta de cada um
 * (`GET /api/v1/peritos/{id}/pastas-perito/processos`).
 */
@Injectable({ providedIn: 'root' })
export class PeritoProcessosComArquivosService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  listar(peritoId: number): Observable<ProcessoPastaResumo[]> {
    return this.http
      .get<ProcessoPastaResumoApi[]>(`${this.base}/peritos/${peritoId}/pastas-perito/processos`)
      .pipe(map((itens) => itens.map(processoPastaResumoFromApi)));
  }
}
