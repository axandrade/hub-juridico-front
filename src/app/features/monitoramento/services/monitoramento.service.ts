import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, switchMap } from 'rxjs';

import { DomainService } from '../../../core/services/domain.service';
import { environment } from '../../../../environments/environment';

/** Situação de uma fonte na última consulta do número (`andamento_resumos`). */
export type SituacaoFonte = 'ENCONTRADO' | 'NAO_ENCONTRADO' | 'FALHOU';

/** Resumo das três fontes, pra filtro/contagem (ver `vw_monitoramento_processos`). */
export type SituacaoProcesso = 'NUMERO_INVALIDO' | 'NAO_CONSULTADO' | 'COM_FALHA' | 'ENCONTRADO' | 'NAO_ENCONTRADO';

/** Linha de `/domain/monitoramento-resumo` (camelCase — leitura do ddd-noap). */
export interface MonitoramentoResumoRow {
  id: number;
  nome: string;
  descricao: string | null;
  ativo: boolean;
  ultimaAtualizacaoEm: string | null;
  totalProcessos: number;
  totalEncontrados: number;
  totalNaoEncontrados: number;
  totalComFalha: number;
  totalNaoConsultados: number;
  totalNumeroInvalido: number;
}

/** Linha de `/domain/monitoramento-processo-resumo` — dados informados + resumo da última consulta. */
export interface MonitoramentoProcessoRow {
  id: number;
  monitoramentoId: number;
  numeroCnj: string;
  numeroCnjDigitos: string;
  cliente: string;
  contrario: string | null;
  acaoId: number | null;
  acao: string | null;
  statusId: number | null;
  status: string | null;
  observacao: string | null;
  datajud: SituacaoFonte | null;
  stf: SituacaoFonte | null;
  comunica: SituacaoFonte | null;
  tribunal: string | null;
  ultimoMovimentoEm: string | null;
  ultimoMovimento: string | null;
  consultadoEm: string | null;
  /** Dígito verificador confere — número inválido não é consultável (as fontes recusam). */
  numeroValido: boolean;
  situacao: SituacaoProcesso;
  processoId: number | null;
  processoPasta: string | null;
}

/** O que a tela aproveita de um processo já cadastrado com o mesmo número (`/domain/processo-operacoes`). */
export interface ProcessoCadastradoRow {
  id: number;
  numeroCnj: string;
  clientePrincipalNome: string | null;
  contrarioPrincipalNome: string | null;
}

/** Corpo de escrita de `/domain/monitoramento` (snake_case — escrita do ddd-noap). */
export interface MonitoramentoCorpo {
  nome: string;
  descricao: string | null;
  ativo?: boolean;
}

/** Corpo de escrita de `/domain/monitoramento-processo`. */
export interface MonitoramentoProcessoCorpo {
  monitoramento_id?: number;
  numero_cnj: string;
  cliente: string;
  contrario: string | null;
  acao_id: number | null;
  status_id: number | null;
  observacao: string | null;
}

/** Corpo de `POST /domain/processo` no "Cadastrar no sistema" (snake_case — escrita do ddd-noap). */
export interface ProcessoNovoCorpo {
  tipo: 'JUDICIAL';
  numero_cnj: string;
  acao_id: number | null;
  status_id: number | null;
  observacoes_gerais: string | null;
  clientes: { pessoa_id: number; posicao_id: null; principal: boolean }[];
  partes_contrarias: { nome: string; posicao_id: null; documento: null; principal: boolean }[];
}

/** Uma linha das novidades do backend: `id` do monitoramento ou da linha do processo no monitoramento. */
interface NovidadesApi {
  id: number;
  total: number;
}

const SERVICE = 'monitoramento-service';

function porId(linhas: NovidadesApi[]): Record<number, number> {
  return Object.fromEntries(linhas.map((l) => [l.id, l.total]));
}

/** Andamento do "Atualizar" do monitoramento (`MonitoramentoAtualizacaoService.Situacao` no backend, snake_case). */
export interface AtualizacaoApi {
  monitoramento_id: number;
  em_andamento: boolean;
  cancelada: boolean;
  total: number;
  concluidos: number;
  falhas: number;
  iniciada_em: string;
  terminada_em: string | null;
}

/**
 * Tela de Monitoramento. Listagens vão direto pelo `app-domain-model-table` (views
 * `monitoramento-resumo`/`monitoramento-processo-resumo`); aqui fica a escrita genérica em
 * `/domain/monitoramento` e `/domain/monitoramento-processo`, e o que é do `MonitoramentoService` do
 * backend (`/domain/service/monitoramento-service`): novidades por usuário e o "Atualizar" em
 * segundo plano.
 */
@Injectable({ providedIn: 'root' })
export class MonitoramentoService {
  private readonly http = inject(HttpClient);
  private readonly domain = inject(DomainService);

  buscarResumo(id: number): Observable<MonitoramentoResumoRow> {
    return this.domain.get<MonitoramentoResumoRow>({ entityName: 'monitoramento-resumo', entityId: id });
  }

  buscarProcessoResumo(id: number): Observable<MonitoramentoProcessoRow> {
    return this.domain.get<MonitoramentoProcessoRow>({ entityName: 'monitoramento-processo-resumo', entityId: id });
  }

  criar(corpo: MonitoramentoCorpo): Observable<number> {
    return this.domain.post<MonitoramentoCorpo>({ entityName: 'monitoramento', body: corpo }).pipe(map((r) => r.id));
  }

  editar(id: number, corpo: MonitoramentoCorpo): Observable<void> {
    return this.domain.patch<MonitoramentoCorpo>({ entityName: 'monitoramento', entityId: id, body: corpo });
  }

  adicionarProcesso(corpo: MonitoramentoProcessoCorpo): Observable<number> {
    return this.domain.post<MonitoramentoProcessoCorpo>({ entityName: 'monitoramento-processo', body: corpo }).pipe(map((r) => r.id));
  }

  editarProcesso(id: number, corpo: MonitoramentoProcessoCorpo): Observable<void> {
    return this.domain.patch<MonitoramentoProcessoCorpo>({ entityName: 'monitoramento-processo', entityId: id, body: corpo });
  }

  removerProcesso(id: number): Observable<void> {
    return this.domain.delete({ entityName: 'monitoramento-processo', entityId: id });
  }

  /**
   * Novidades não vistas pelo usuário logado, por monitoramento (`{id do monitoramento: total}`, só
   * os que têm) — `MonitoramentoService` do backend via `/domain/service`; o usuário sai do token.
   */
  novidadesPorMonitoramento(): Observable<Record<number, number>> {
    return this.domain
      .postServiceMethod<NovidadesApi[]>({ serviceName: SERVICE, method: 'novidades-por-monitoramento' })
      .pipe(map(porId));
  }

  /** Novidades não vistas pelo usuário logado em cada processo do monitoramento (`{id da linha: total}`). */
  novidadesDoMonitoramento(monitoramentoId: number): Observable<Record<number, number>> {
    return this.domain
      .postServiceMethod<NovidadesApi[]>({
        serviceName: SERVICE,
        method: 'novidades-do-monitoramento',
        args: { monitoramentoId },
      })
      .pipe(map(porId));
  }

  /** "Atualizar": o backend consulta todos os números em segundo plano e devolve na hora. */
  iniciarAtualizacao(monitoramentoId: number): Observable<AtualizacaoApi> {
    return this.domain.postServiceMethod<AtualizacaoApi>({
      serviceName: SERVICE,
      method: 'iniciar-atualizacao',
      args: { monitoramentoId },
    });
  }

  /** `null` quando não houve atualização recente. */
  situacaoAtualizacao(monitoramentoId: number): Observable<AtualizacaoApi | null> {
    return this.domain
      .postServiceMethod<AtualizacaoApi | null>({ serviceName: SERVICE, method: 'situacao-atualizacao', args: { monitoramentoId } })
      .pipe(map((a) => a ?? null));
  }

  cancelarAtualizacao(monitoramentoId: number): Observable<void> {
    return this.domain.postServiceMethod<void>({ serviceName: SERVICE, method: 'cancelar-atualizacao', args: { monitoramentoId } });
  }

  /**
   * Primeira consulta das fontes de um número recém-adicionado ("Consultar as fontes ao salvar") —
   * o mesmo endpoint do painel de Andamentos Automáticos, sem `atualizar`: se o número já foi
   * consultado por outro monitoramento ou pelo cadastro, reaproveita a gravação.
   */
  consultarFontes(numeroCnj: string): Observable<unknown> {
    return this.http.get(`${environment.apiBaseUrl}/andamentos/${numeroCnj.replace(/\D/g, '')}`);
  }

  /**
   * "Cadastrar no sistema": cria o processo em `/domain/processo` e devolve a `pasta` gerada
   * (`PROC-000123`) — o `POST` do ddd-noap só devolve o id.
   */
  cadastrarNoSistema(corpo: ProcessoNovoCorpo): Observable<string | null> {
    return this.domain.post<ProcessoNovoCorpo>({ entityName: 'processo', body: corpo }).pipe(
      switchMap(({ id }) => this.domain.get<{ pasta: string | null }>({ entityName: 'processo', entityId: id, fields: 'id,pasta' })),
      map((p) => p.pasta ?? null),
    );
  }

  /** Processo do cadastro com este número (máscara exata), pra oferecer "usar dados do cadastro". */
  processoCadastrado(numeroCnj: string): Observable<ProcessoCadastradoRow | null> {
    return this.domain
      .get<{ content: ProcessoCadastradoRow[] }>({
        entityName: 'processo-operacoes',
        fields: 'id,numeroCnj,clientePrincipalNome,contrarioPrincipalNome',
        filter: `numeroCnj eq '${numeroCnj}'`,
        size: 1,
      })
      .pipe(map((pagina) => pagina.content?.[0] ?? null));
  }
}
