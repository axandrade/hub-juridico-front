import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { StfResumoApi } from './andamentos.service';

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
 * `PublicacoesProcessoResponse` do backend (`GET /api/v1/processos/{id}/publicacoes`) — publicações
 * de todas as fontes numa lista só, da mais recente pra mais antiga; `stf` resume a consulta ao STF.
 */
export interface PublicacoesProcessoApi {
  processo_id: number;
  numero_cnj: string;
  consultado_em: string;
  publicacoes: PublicacaoApi[];
  stf: StfResumoApi;
}

/** Publicações do processo (Comunica PJe/DJEN + STF/DJe) — o backend consulta as fontes, aqui só chama. */
@Injectable({ providedIn: 'root' })
export class PublicacoesService {
  private readonly http = inject(HttpClient);

  consultar(processoId: number): Observable<PublicacoesProcessoApi> {
    return this.http.get<PublicacoesProcessoApi>(`${environment.apiBaseUrl}/processos/${processoId}/publicacoes`);
  }
}
