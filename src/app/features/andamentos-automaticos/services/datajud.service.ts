import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';

export type StatusDatajud = 'OK' | 'PARCIAL' | 'NAO_ENCONTRADO';

export const STATUS_DATAJUD_LABEL: Record<StatusDatajud, string> = {
  OK: 'OK',
  PARCIAL: 'OK (parcial)',
  NAO_ENCONTRADO: 'Não encontrado no DataJud',
};

/** Resumo de uma capa do DataJud (uma por grau/órgão) — `DatajudVisaoGeralResponse.Capa` do backend. */
export interface DatajudCapaResumoApi {
  tribunal: string | null;
  grau: string | null;
  classe: string | null;
  orgao_julgador: string | null;
  data_ultima_atualizacao: string | null;
  total_andamentos: number;
}

/**
 * `DatajudVisaoGeralResponse` do backend (`GET /api/v1/processos/{id}/datajud/visao-geral`) —
 * bean comum, então vem em snake_case (`JacksonConfig`). Campos da capa são `null` quando
 * `status = 'NAO_ENCONTRADO'`.
 */
export interface DatajudVisaoGeralApi {
  processo_id: number;
  numero_cnj: string;
  status: StatusDatajud;
  consultado_em: string;
  tribunais_consultados: string[];
  tribunais_com_falha: string[];
  tribunal: string | null;
  tribunal_nome: string | null;
  grau: string | null;
  classe: string | null;
  orgao_julgador: string | null;
  /** Data/hora como a origem informou, sem fuso (`LocalDateTime`). */
  data_ajuizamento: string | null;
  sistema: string | null;
  formato: string | null;
  assuntos: string[];
  nivel_sigilo: number | null;
  data_ultima_atualizacao: string | null;
  total_capas: number;
  total_andamentos: number;
  /** Movimento mais recente entre todas as capas; `null` se não houver nenhum. */
  ultimo_movimento: { data_hora: string; nome: string | null } | null;
  capas: DatajudCapaResumoApi[];
}

/** Consulta ao DataJud — feita pelo backend (`DatajudClient`), aqui só chama. */
@Injectable({ providedIn: 'root' })
export class DatajudService {
  private readonly http = inject(HttpClient);

  visaoGeral(processoId: number): Observable<DatajudVisaoGeralApi> {
    return this.http.get<DatajudVisaoGeralApi>(
      `${environment.apiBaseUrl}/processos/${processoId}/datajud/visao-geral`,
    );
  }
}
