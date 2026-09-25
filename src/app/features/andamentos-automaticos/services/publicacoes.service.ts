import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../../environments/environment';

/**
 * Uma publicação do DJEN — `PublicacoesProcessoResponse.Publicacao` do backend (snake_case).
 * Datas são `yyyy-MM-dd` (dia da origem, sem fuso). `conteudo_identificado` é o que a publicação
 * contém de fato (pode diferir de `documento`: uma "Intimação" com inteiro teor de acórdão vira
 * "Acórdão"). `texto` já vem convertido de HTML.
 */
export interface PublicacaoApi {
  /** Posição cronológica (1 = mais antiga). A lista já vem da mais recente pra mais antiga. */
  ordem: number;
  id: number | null;
  data_disponibilizacao: string | null;
  /** Normalmente a API não informa. */
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
  /** Documento no PJe do tribunal. */
  link: string | null;
  /** PDF da certidão de publicação no Comunica. */
  certidao_url: string | null;
  numero_comunicacao: number | null;
  hash: string | null;
}

/** `PublicacoesProcessoResponse` do backend (`GET /api/v1/processos/{id}/publicacoes`). */
export interface PublicacoesProcessoApi {
  processo_id: number;
  numero_cnj: string;
  consultado_em: string;
  publicacoes: PublicacaoApi[];
}

/** Publicações do processo no DJEN — o backend consulta o Comunica PJe (`ComunicaClient`), aqui só chama. */
@Injectable({ providedIn: 'root' })
export class PublicacoesService {
  private readonly http = inject(HttpClient);

  consultar(processoId: number): Observable<PublicacoesProcessoApi> {
    return this.http.get<PublicacoesProcessoApi>(`${environment.apiBaseUrl}/processos/${processoId}/publicacoes`);
  }
}
