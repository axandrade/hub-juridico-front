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

export type StatusComunica = 'OK' | 'NAO_ENCONTRADO' | 'FALHA';

export const STATUS_COMUNICA_LABEL: Record<StatusComunica, string> = {
  OK: 'OK',
  NAO_ENCONTRADO: 'Sem publicações no DJEN',
  FALHA: 'Erro',
};

export type StatusStf = 'ENCONTRADO' | 'NAO_ENCONTRADO' | 'FALHA';

export const STATUS_STF_LABEL: Record<StatusStf, string> = {
  ENCONTRADO: 'OK',
  NAO_ENCONTRADO: 'Não localizado no STF',
  FALHA: 'Erro',
};

/** Resumo de uma capa do DataJud (uma por grau/órgão) — `AndamentosProcessoResponse.Capa` do backend. */
export interface DatajudCapaResumoApi {
  tribunal: string | null;
  grau: string | null;
  classe: string | null;
  orgao_julgador: string | null;
  data_ultima_atualizacao: string | null;
  total_andamentos: number;
}

/**
 * Uma linha da aba "Andamentos" — linha do tempo única de todas as fontes (`fonte`).
 * - `DataJud`: movimento consolidado entre as capas (`graus` acumula G1/G2...), `tipo` "Movimento",
 *   `link` `null`, `data_hora` sem fuso (hora como o tribunal informou).
 * - `STF`: andamento da consulta pública do portal — `data_hora` só com a data (00:00), `tipo`
 *   classificado pelo nome (Acórdão/Decisão/Despacho...), `codigo` `null`, `graus` ["STF"],
 *   `orgao_julgador` = ministro/órgão, `complementos` = observação e "Peça: ...", `link` = 1ª peça.
 * - `Comunica/DJEN`: cada publicação da aba "Publicações" vinda do Comunica — `data_hora` = dia da
 *   disponibilização (00:00), `tipo` = documento, `nome` = documento + " — conteúdo localizado no
 *   Comunica/DJEN", `graus` vazio, `orgao_julgador` = órgão, `link` = documento no PJe,
 *   `complementos` = "Conteúdo identificado: ..." quando difere do documento.
 * `data_disponibilizacao_djen` só vem nas linhas do Comunica.
 */
export interface AndamentoApi {
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

/** Processo do STF com o mesmo número único — `identificacao` = classe + número ("RE 1610218"). */
export interface ProcessoStfApi {
  identificacao: string | null;
  incidente: string;
  url: string;
  total_andamentos: number;
}

/**
 * `StfResumo` do backend — campo `stf` das abas "Andamentos" e "Publicações". `FALHA` não derruba a
 * aba (as demais fontes continuam); `processos` só vem preenchido em `ENCONTRADO`.
 */
export interface StfResumoApi {
  status: StatusStf;
  processos: ProcessoStfApi[];
}

/**
 * Uma publicação — `PublicacoesProcessoResponse.Publicacao` do backend (snake_case). `fonte` diz de
 * onde veio: `Comunica/DJEN` ou `STF/DJe` (andamento do STF que é publicação no DJe, ou edição do
 * índice DJ/DJe do STF — `documento` "Índice DJ/DJe STF"; sem destinatários/advogados/certidão).
 * Datas são `yyyy-MM-dd` (dia da origem, sem fuso). `conteudo_identificado` é o que a publicação
 * contém de fato (pode diferir de `documento`: uma "Intimação" com inteiro teor de acórdão vira
 * "Acórdão"). `texto` já vem convertido de HTML.
 */
export interface PublicacaoApi {
  /** Posição cronológica (1 = mais antiga). A lista já vem da mais recente pra mais antiga. */
  ordem: number;
  id: number | null;
  data_disponibilizacao: string | null;
  /** Comunica normalmente não informa; STF sempre informa (`data_disponibilizacao` = "divulgado em"). */
  data_publicacao: string | null;
  fonte: string;
  tribunal: string | null;
  tipo: string | null;
  documento: string | null;
  conteudo_identificado: string;
  meio: string | null;
  orgao: string | null;
  classe: string | null;
  /** "NOME (polo ativo|passivo)". */
  destinatarios: string[];
  /** "NOME — OAB UF NÚMERO". */
  advogados: string[];
  cancelada: boolean;
  motivo_cancelamento: string | null;
  texto: string;
  /** Comunica: documento no PJe do tribunal. STF: peça (PDF), matéria no DJ ou ficha do processo. */
  link: string | null;
  /** PDF da certidão de publicação no Comunica. */
  certidao_url: string | null;
  numero_comunicacao: number | null;
  hash: string | null;
}

/**
 * `AndamentosProcessoResponse` do backend (`GET /api/v1/processos/{id}/andamentos`) — alimenta as
 * abas "Visão geral", "Andamentos" e "Publicações" numa consulta só, juntando DataJud, STF e Comunica
 * (cada fonte chamada uma vez; o DataJud chega a levar ~1 min). Bean comum, então vem em snake_case (`JacksonConfig`). `status` e os campos da
 * capa são do DataJud (capa `null` quando `status = 'NAO_ENCONTRADO'`); `stf` resume a consulta ao
 * STF e `comunica` a do Comunica; `andamentos`, `total_andamentos` e `ultimo_movimento` contam todas as fontes.
 */
export interface AndamentosProcessoApi {
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
  /** Andamento mais recente entre todas as fontes (sem fuso); `null` se não houver nenhum. */
  ultimo_movimento: { data_hora: string | null; nome: string | null } | null;
  capas: DatajudCapaResumoApi[];
  andamentos: AndamentoApi[];
  /** Aba "Publicações": Comunica/DJEN + DJe do STF, da mais recente pra mais antiga. */
  publicacoes: PublicacaoApi[];
  stf: StfResumoApi;
  /** Resumo da consulta ao Comunica pra linha do tempo — `FALHA` não derruba o painel. */
  comunica: { status: StatusComunica; total_publicacoes: number };
}

/**
 * Consulta dos andamentos automáticos (DataJud + STF + Comunica/DJEN) — feita pelo backend, aqui só chama.
 *
 * As abas "Visão geral", "Andamentos" e "Publicações" carregam cada uma por conta própria (padrão
 * das abas do projeto), mas o DataJud chega a levar ~1 min: por isso a resposta é compartilhada por
 * processo — a aba que pede o mesmo `processoId` depois reaproveita a mesma requisição (em andamento ou já
 * concluída) em vez de consultar de novo. Erro não fica no cache. `recarregar` descarta o cache
 * daquele processo e avança `versao`, que as abas observam pra pedir de novo — juntas, numa
 * requisição só.
 */
@Injectable({ providedIn: 'root' })
export class AndamentosService {
  private readonly http = inject(HttpClient);
  private readonly cache = new Map<number, Observable<AndamentosProcessoApi>>();
  private readonly versaoInterna = signal(0);

  /** Muda a cada `recarregar` — as abas leem num `effect` pra refazer a consulta. */
  readonly versao = this.versaoInterna.asReadonly();

  consultar(processoId: number): Observable<AndamentosProcessoApi> {
    let consulta = this.cache.get(processoId);
    if (!consulta) {
      consulta = this.http
        .get<AndamentosProcessoApi>(`${environment.apiBaseUrl}/processos/${processoId}/andamentos`)
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
