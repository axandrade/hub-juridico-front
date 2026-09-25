import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, shareReplay, throwError } from 'rxjs';

import { environment } from '../../../../environments/environment';

export type StatusDatajud = 'OK' | 'PARCIAL' | 'NAO_ENCONTRADO';

export const STATUS_DATAJUD_LABEL: Record<StatusDatajud, string> = {
  OK: 'OK',
  PARCIAL: 'OK (parcial)',
  NAO_ENCONTRADO: 'Não encontrado no DataJud',
};

/** Resumo de uma capa do DataJud (uma por grau/órgão) — `DatajudProcessoResponse.Capa` do backend. */
export interface DatajudCapaResumoApi {
  tribunal: string | null;
  grau: string | null;
  classe: string | null;
  orgao_julgador: string | null;
  data_ultima_atualizacao: string | null;
  total_andamentos: number;
}

/**
 * Uma linha da aba "Andamentos" — movimento consolidado entre as capas (`graus` acumula G1/G2...).
 * `data_hora` vem sem fuso (hora como o tribunal informou). `tipo`/`fonte` por enquanto são sempre
 * "Movimento"/"DataJud"; `link` e `data_disponibilizacao_djen` são sempre `null` (DataJud não tem;
 * a data de disponibilização vem com a integração Comunica/DJEN).
 */
export interface DatajudAndamentoApi {
  /** Posição cronológica (1 = mais antigo). A lista já vem do mais recente pro mais antigo. */
  ordem: number;
  data_hora: string | null;
  tipo: string;
  /** Código TPU do movimento. */
  codigo: number | null;
  nome: string | null;
  complementos: string[];
  fonte: string;
  graus: string[];
  orgao_julgador: string | null;
  link: string | null;
  /** Data (`yyyy-MM-dd`) em que a publicação foi disponibilizada no DJEN. */
  data_disponibilizacao_djen: string | null;
}

/**
 * `DatajudProcessoResponse` do backend (`GET /api/v1/processos/{id}/datajud`) — alimenta as abas
 * "Visão geral" e "Andamentos" numa consulta só (o DataJud chega a levar ~1 min). Bean comum, então
 * vem em snake_case (`JacksonConfig`). Campos da capa são `null` quando `status = 'NAO_ENCONTRADO'`.
 */
export interface DatajudProcessoApi {
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
  /** Movimento mais recente entre todas as capas (sem fuso); `null` se não houver nenhum. */
  ultimo_movimento: { data_hora: string | null; nome: string | null } | null;
  capas: DatajudCapaResumoApi[];
  andamentos: DatajudAndamentoApi[];
}

/**
 * Consulta ao DataJud — feita pelo backend (`DatajudClient`), aqui só chama.
 *
 * As abas "Visão geral" e "Andamentos" carregam cada uma por conta própria (padrão das abas do
 * projeto), mas o DataJud chega a levar ~1 min: por isso a resposta é compartilhada por processo —
 * a segunda aba que pede o mesmo `processoId` reaproveita a mesma requisição (em andamento ou já
 * concluída) em vez de consultar de novo. Erro não fica no cache. `recarregar` descarta o cache
 * daquele processo e avança `versao`, que as abas observam pra pedir de novo — juntas, numa
 * requisição só.
 */
@Injectable({ providedIn: 'root' })
export class DatajudService {
  private readonly http = inject(HttpClient);
  private readonly cache = new Map<number, Observable<DatajudProcessoApi>>();
  private readonly versaoInterna = signal(0);

  /** Muda a cada `recarregar` — as abas leem num `effect` pra refazer a consulta. */
  readonly versao = this.versaoInterna.asReadonly();

  consultar(processoId: number): Observable<DatajudProcessoApi> {
    let consulta = this.cache.get(processoId);
    if (!consulta) {
      consulta = this.http
        .get<DatajudProcessoApi>(`${environment.apiBaseUrl}/processos/${processoId}/datajud`)
        .pipe(
          catchError((err: unknown) => {
            this.cache.delete(processoId);
            return throwError(() => err);
          }),
          shareReplay({ bufferSize: 1, refCount: false }),
        );
      this.cache.set(processoId, consulta);
    }
    return consulta;
  }

  recarregar(processoId: number): void {
    this.cache.delete(processoId);
    this.versaoInterna.update((v) => v + 1);
  }
}
