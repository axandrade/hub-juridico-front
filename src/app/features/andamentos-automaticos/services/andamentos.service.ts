import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, finalize, of, shareReplay, tap } from 'rxjs';

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
  /** Identificador estável do item — a mesma publicação do DJEN tem a mesma chave nas duas abas. */
  chave: string;
  /** Apareceu num "Atualizar" e o usuário ainda não marcou como visto (no servidor — ver `ehNovo`). */
  novo: boolean;
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
  /** Ver `AndamentoApi.chave`. */
  chave: string;
  /** Ver `AndamentoApi.novo`. */
  novo: boolean;
}

/** Item que pode ser novidade — andamento ou publicação. */
export type ItemComNovidade = Pick<AndamentoApi, 'chave' | 'novo'>;

/**
 * Situação de uma fonte na consulta — `falhou`: a fonte não respondeu desta vez e o que aparece é a
 * gravação de `consultado_em` (`null` = nunca respondeu, o painel está sem os dados de lá).
 */
export interface SituacaoFonteApi {
  fonte: string;
  consultado_em: string | null;
  falhou: boolean;
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
  /** Consulta mais antiga entre as fontes com dado — a tela nunca parece mais atualizada do que está. */
  consultado_em: string | null;
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
  /** DataJud, STF e Comunica/DJEN, nessa ordem. */
  fontes: SituacaoFonteApi[];
}

/**
 * Consulta dos andamentos automáticos (DataJud + STF + Comunica/DJEN) — feita pelo backend, aqui só chama.
 *
 * As abas "Visão geral", "Andamentos" e "Publicações" carregam cada uma por conta própria (padrão
 * das abas do projeto), mas o DataJud chega a levar ~1 min: por isso a resposta é compartilhada por
 * processo — a aba que pede o mesmo `processoId` depois reaproveita a mesma requisição (em andamento ou já
 * concluída) em vez de consultar de novo. Erro não fica no cache. Quando nenhuma aba quer mais a
 * resposta (o usuário trocou de processo antes de ela chegar), a requisição é cancelada e sai do
 * cache — clicar rápido entre processos não acumula requisições; voltar ao processo consulta de novo
 * (o backend termina e grava a consulta cancelada, então a volta costuma ser rápida). `recarregar` descarta o cache
 * daquele processo e avança `versao`, que as abas observam pra pedir de novo — juntas, numa
 * requisição só.
 *
 * O backend grava a última consulta de cada fonte: sem parâmetro, devolve o que está gravado (e só
 * consulta as APIs externas pelo que falta); depois de `recarregar`, a próxima consulta daquele
 * processo vai com `atualizar=true` e consulta tudo de novo.
 *
 * Novidades: item com `novo = true` fica em negrito até o usuário marcar como visto (clicar na linha
 * ou "Marcar todos como vistos"). A marcação vale na hora pra todas as abas (`vistos`, sinal
 * compartilhado) e vai pro backend (`POST .../andamentos/vistos`); se o POST falhar, o item volta a
 * aparecer como novo. `novos(processoId)` conta o que ainda falta ver, pras abas mostrarem o total.
 */
@Injectable({ providedIn: 'root' })
export class AndamentosService {
  private readonly http = inject(HttpClient);
  private readonly cache = new Map<number, Observable<AndamentosProcessoApi>>();
  private readonly versaoInterna = signal(0);
  /** Última resposta de cada processo — base de `novos`. */
  private readonly respostas = signal<ReadonlyMap<number, AndamentosProcessoApi>>(new Map());
  /** `processoId:chave` marcados como vistos nesta sessão (antes ou depois de o servidor confirmar). */
  private readonly vistos = signal<ReadonlySet<string>>(new Set());
  /** Processos cujo "Atualizar" ainda não virou requisição — a próxima vai com `atualizar=true`. */
  private readonly aAtualizar = new Set<number>();

  /** Muda a cada `recarregar` — as abas leem num `effect` pra refazer a consulta. */
  readonly versao = this.versaoInterna.asReadonly();

  consultar(processoId: number): Observable<AndamentosProcessoApi> {
    let consulta = this.cache.get(processoId);
    if (!consulta) {
      const atualizar = this.aAtualizar.delete(processoId);
      const params = atualizar ? new HttpParams().set('atualizar', true) : undefined;
      consulta = this.http
        .get<AndamentosProcessoApi>(`${environment.apiBaseUrl}/processos/${processoId}/andamentos`, { params })
        .pipe(
          tap((resposta) => {
            this.respostas.update((m) => new Map(m).set(processoId, resposta));
            // Chegou: o cache passa a guardar a resposta em si — a requisição já pode ser encerrada.
            if (this.cache.get(processoId) === requisicao) {
              this.cache.set(processoId, of(resposta));
            }
          }),
          // Erro, ou ninguém mais inscrito antes da resposta (cancelada): não fica no cache.
          finalize(() => this.descartar(processoId, requisicao)),
          shareReplay({ bufferSize: 1, refCount: true }),
        );
      const requisicao = consulta;
      this.cache.set(processoId, requisicao);
    }
    return consulta;
  }

  /** Tira do cache só se ainda for esta requisição (um `recarregar` pode já ter posto outra no lugar). */
  private descartar(processoId: number, requisicao: Observable<AndamentosProcessoApi>): void {
    if (this.cache.get(processoId) === requisicao) {
      this.cache.delete(processoId);
    }
  }

  recarregar(processoId: number): void {
    this.cache.delete(processoId);
    this.aAtualizar.add(processoId);
    this.versaoInterna.update((v) => v + 1);
  }

  /** Novidade que o usuário ainda não viu — lê o sinal `vistos`, então serve em `computed`/template. */
  ehNovo(processoId: number, item: ItemComNovidade): boolean {
    return item.novo && !this.vistos().has(`${processoId}:${item.chave}`);
  }

  /** Andamentos e publicações ainda não vistos do processo (0 antes da primeira resposta). */
  novos(processoId: number): { andamentos: number; publicacoes: number } {
    const resposta = this.respostas().get(processoId);
    return {
      andamentos: resposta?.andamentos.filter((a) => this.ehNovo(processoId, a)).length ?? 0,
      publicacoes: resposta?.publicacoes.filter((p) => this.ehNovo(processoId, p)).length ?? 0,
    };
  }

  /** Marca estes itens como vistos (os que não são novidade são ignorados). */
  marcarVistos(processoId: number, itens: ItemComNovidade[]): void {
    const chaves = [...new Set(itens.filter((i) => this.ehNovo(processoId, i)).map((i) => i.chave))];
    if (chaves.length) {
      this.enviarVistos(processoId, chaves, { chaves });
    }
  }

  /** "Marcar todos como vistos" — todas as novidades do processo, nas duas abas. */
  marcarTodosVistos(processoId: number): void {
    const resposta = this.respostas().get(processoId);
    const itens: ItemComNovidade[] = [...(resposta?.andamentos ?? []), ...(resposta?.publicacoes ?? [])];
    const chaves = [...new Set(itens.filter((i) => this.ehNovo(processoId, i)).map((i) => i.chave))];
    if (chaves.length) {
      this.enviarVistos(processoId, chaves, { todos: true });
    }
  }

  private enviarVistos(processoId: number, chaves: string[], corpo: { chaves: string[] } | { todos: true }): void {
    const ids = chaves.map((c) => `${processoId}:${c}`);
    this.vistos.update((v) => new Set([...v, ...ids]));
    this.http.post<void>(`${environment.apiBaseUrl}/processos/${processoId}/andamentos/vistos`, corpo).subscribe({
      error: () =>
        this.vistos.update((v) => {
          const restantes = new Set(v);
          ids.forEach((id) => restantes.delete(id));
          return restantes;
        }),
    });
  }
}
