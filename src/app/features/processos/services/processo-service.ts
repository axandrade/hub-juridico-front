import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, switchMap, tap } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { DomainFavoritoService } from '../../../core/services/domain-favorito.service';
import { DomainService, IDomainPage } from '../../../core/services/domain.service';
import { FavoritoService } from '../../../shared/services/favorito.service';
import {
  CenarioRiscoApi,
  ClienteProcessoApi,
  OutroEnvolvidoAdvogadoApi,
  OutroEnvolvidoAssistenteTecnicoApi,
  OutroEnvolvidoMagistradoWriteApi,
  OutroEnvolvidoPeritoWriteApi,
  OutroEnvolvidoTestemunhaApi,
  ParteContrariaApi,
  ProcessoApi,
  ProcessoResumoApi,
  ProcessoWriteApi,
  TipoProcesso,
} from './processo-api.model';
import { onlyDigits } from '../../../core/auth/documentos-br';

/**
 * Filtros de `carregar()` (via `/domain/processo`) — `busca` casa parcialmente em número CNJ /
 * status / natureza / ação / cidade; `tipo` é igualdade; `incluirInativos` (`false` padrão) traz
 * só `ativo = true`.
 */
export interface ProcessoListQuery {
  page: number;
  busca?: string;
  tipo?: TipoProcesso | null;
  incluirInativos: boolean;
}

/** Campos editáveis do processo (aba "Informações básicas") — o que o formulário produz. */
export interface ProcessoEditavel {
  id: number;
  tipo: TipoProcesso;
  numeroCnj: string;
  /** Id do catálogo `status_processo` — `null` = sem status. */
  statusId: number | null;

  contrarioPrincipalNome: string;
  /** Id do catálogo `posicao_cliente` (mesmo catálogo de `clientePrincipalPosicaoId`). */
  contrarioPrincipalPosicaoId: number | null;
  /** CPF ou CNPJ (mascarado ou não) — o serviço manda só os dígitos. */
  contrarioPrincipalDocumento: string;

  advogadoResponsavelId: number | null;
  dataDistribuicao: string;
  /** Id do catálogo `acao_processo` — `null` = sem ação. */
  acaoId: number | null;
  /** Id do catálogo `natureza_processo` — `null` = sem natureza. */
  naturezaId: number | null;
  /** Id do catálogo `procedimento_processo` — `null` = sem procedimento. */
  procedimentoId: number | null;
  /** Id do catálogo `fase_processo` — `null` = sem fase. */
  faseId: number | null;
  uf: string;
  cidadeId: number | null;
  observacoesGerais: string;
  /** Se marcado, "observacoesGerais" aparece como tooltip ao passar o mouse na linha da listagem. */
  destacarObservacao: boolean;

  // aba "Objeto"
  objetoPrincipal: string;
  objetosSecundarios: string[];
  observacoesObjeto: string;
  valorPedido: number | null;
  valorDeferido: number | null;
  cenarioProvavel: CenarioRiscoApi;
  cenarioPossivel: CenarioRiscoApi;
  cenarioRemoto: CenarioRiscoApi;

  tags: string[];
  /** Id do catálogo `tribunais` — independente do órgão (dá pra ter só o tribunal). */
  tribunalAtualId: number | null;
  /** Id do catálogo `orgao_julgador` (chave estrangeira) — escolhido via cascata Tribunal→Órgão. */
  orgaoProcessanteId: number | null;
  escritoriosAnteriores: string[];
  /** Advogados "outros envolvidos" (aba "Outros envolvidos"). */
  outrosEnvolvidosAdvogados: OutroEnvolvidoAdvogadoApi[];
  /** Magistrados "outros envolvidos" (aba "Outros envolvidos"). */
  outrosEnvolvidosMagistrados: OutroEnvolvidoMagistradoWriteApi[];
  /** Testemunhas "outros envolvidos" (aba "Outros envolvidos"). */
  outrosEnvolvidosTestemunhas: OutroEnvolvidoTestemunhaApi[];
  /** Peritos judiciais "outros envolvidos" (aba "Outros envolvidos"). */
  outrosEnvolvidosPeritos: OutroEnvolvidoPeritoWriteApi[];
  /** Assistentes técnicos "outros envolvidos" (aba "Outros envolvidos"). */
  outrosEnvolvidosAssistentesTecnicos: OutroEnvolvidoAssistenteTecnicoApi[];
  /** Lista de clientes do processo — um deles (`principal: true`) é o cliente principal. */
  clientes: ClienteProcessoApi[];
  /** Preservado como veio — ainda sem UI de edição nesta fatia. */
  partesContrarias: ParteContrariaApi[];
}

const vazioParaNull = (valor: string): string | null => valor.trim() || null;

/** Campos livremente buscáveis pela caixa de busca — mesmos de `ProcessoRepository.listarComFiltros`. */
const CAMPOS_BUSCA = ['numeroCnj', 'status', 'natureza', 'acao', 'cidade'] as const;

/** Linha crua de `/domain/processo` (camelCase) — só os escalares que `ProcessoResumoApi` usa. */
interface ProcessoResumoDomain {
  id: number;
  tipo: TipoProcesso;
  numeroCnj: string | null;
  status: string | null;
  statusId: number | null;
  pasta: string | null;
  clientePrincipalId: number | null;
  advogadoResponsavelId: number | null;
  natureza: string | null;
  naturezaId: number | null;
  fase: string | null;
  faseId: number | null;
  uf: string | null;
  cidade: string | null;
  cidadeId: number | null;
  dataDistribuicao: string | null;
  observacoesGerais: string | null;
  destacarObservacao: boolean;
  ativo: boolean;
  atualizadoEm: string | null;
}

/** Item de um catálogo simples (`id`, `nome`) — Status/Ação/Natureza/Fase, via `/domain`. */
interface CatalogoItem {
  id: number;
  nome: string;
}

const PROCESSO_RESUMO_FIELDS = [
  'id', 'tipo', 'numeroCnj', 'status', 'statusId', 'pasta', 'clientePrincipalId', 'advogadoResponsavelId',
  'natureza', 'naturezaId', 'fase', 'faseId', 'uf', 'cidade', 'cidadeId', 'dataDistribuicao', 'observacoesGerais',
  'destacarObservacao', 'ativo', 'atualizadoEm',
].join(',');

function processoResumoFromDomain(p: ProcessoResumoDomain, favorito: boolean): ProcessoResumoApi {
  return {
    id: p.id,
    favorito,
    tipo: p.tipo,
    numero_cnj: p.numeroCnj,
    status: p.status,
    status_id: p.statusId,
    pasta: p.pasta,
    cliente_principal_id: p.clientePrincipalId,
    advogado_responsavel_id: p.advogadoResponsavelId,
    natureza: p.natureza,
    natureza_id: p.naturezaId,
    fase: p.fase,
    fase_id: p.faseId,
    uf: p.uf,
    cidade: p.cidade,
    cidade_id: p.cidadeId,
    data_distribuicao: p.dataDistribuicao,
    observacoes_gerais: p.observacoesGerais,
    destacar_observacao: p.destacarObservacao,
    ativo: p.ativo,
    atualizado_em: p.atualizadoEm,
  };
}

/**
 * Fonte da lista de processos. A listagem (`carregar`) busca em `/domain/processo` (ddd-noap),
 * página a página, exatamente como `ProcessoRepository.listarComFiltros` filtrava (mesmos campos
 * de busca livre, `ativo eq true` por padrão, ordenação por `id` — igual ao
 * `@PageableDefault(sort = "id")` que o `AbstractController` usava) — `ProcessosComponent` e o
 * `<app-data-table>` continuam iguais, sem nenhuma mudança visível (tooltip de observação
 * destacada, favoritos fixados no topo da página e a ordenação por clique de coluna são recursos
 * só do `DataTableComponent`, que o `DomainModelTableComponent` genérico não tem — por isso aqui
 * só a fonte dos dados mudou, não o componente). Favoritar já usa `tipo_entidade = "processo"`
 * desde sempre (ver `ProcessoService.TIPO_FAVORITO` no backend), então bate 1:1 com o que
 * `/domain/favorito` espera — nenhum favorito existente fica "órfão".
 *
 * O CRUD de escrita (criar/editar/status) continua em `/api/v1/processos` (Spring), consumido
 * pelo painel `app-processo-form`. Os pickers de Clientes (lista, ver `ProcessoClientesComponent`)
 * / Advogado responsável / Status / Ação / Natureza / Fase são `<app-domain-model-dropdown>` direto
 * no template (busca própria via `/domain`); aqui só ficam `rotuloPessoa`/`rotuloAdvogado`/
 * `rotuloPosicaoCliente` (resolvem o `valueLabel` inicial ao carregar uma ficha) e
 * `criarCatalogo`/`renomearCatalogo`/`excluirCatalogo` (escrita dos catálogos, sem equivalente
 * genérico no componente de dropdown).
 */
@Injectable({ providedIn: 'root' })
export class ProcessoService {
  private readonly http = inject(HttpClient);
  private readonly favoritoService = inject(FavoritoService);
  private readonly domainService = inject(DomainService);
  private readonly domainFavoritoService = inject(DomainFavoritoService);
  private readonly base = `${environment.apiBaseUrl}/processos`;

  static readonly PAGE_SIZE = 10;

  private readonly _processos = signal<ProcessoResumoApi[]>([]);
  readonly processos = this._processos.asReadonly();

  private readonly _page = signal(0);
  private readonly _totalPages = signal(1);
  private readonly _totalElements = signal(0);
  private readonly _last = signal(true);

  readonly page = this._page.asReadonly();
  readonly totalPages = this._totalPages.asReadonly();
  readonly totalElements = this._totalElements.asReadonly();
  readonly last = this._last.asReadonly();

  /** Carrega uma página da lista com os filtros informados. */
  carregar(query: ProcessoListQuery): Observable<ProcessoResumoApi[]> {
    return this.domainService
      .get<IDomainPage<ProcessoResumoDomain>>({
        entityName: 'processo',
        page: query.page,
        size: ProcessoService.PAGE_SIZE,
        fields: PROCESSO_RESUMO_FIELDS,
        filter: this.buildFilter(query.busca, query.tipo, query.incluirInativos) || undefined,
        sort: 'id',
      })
      .pipe(
        tap((pagina) => {
          this._page.set(pagina.number ?? 0);
          this._totalPages.set(pagina.total_pages ?? 1);
          this._totalElements.set(pagina.total_elements ?? 0);
          this._last.set(pagina.last ?? true);
        }),
        switchMap((pagina) => {
          const ids = pagina.content.map((p) => p.id);
          return this.domainFavoritoService
            .listarFavoritos('processo', ids)
            .pipe(map((favoritos) => pagina.content.map((p) => processoResumoFromDomain(p, favoritos.has(p.id)))));
        }),
        tap((processos) => this._processos.set(processos)),
      );
  }

  /**
   * Monta o filtro RQL equivalente a `ProcessoRepository.listarComFiltros`: `busca` casa
   * parcialmente (case-insensitive) em número CNJ / status / natureza / ação / cidade; `tipo` é
   * igualdade; sem `incluirInativos`, só `ativo eq true`. RQL não tem parênteses — todos os `or`
   * vêm primeiro, os `and` por último (mesma regra de `ClientsComponent.buildFilter`).
   */
  private buildFilter(busca: string | undefined, tipo: TipoProcesso | null | undefined, incluirInativos: boolean): string {
    const termo = (busca ?? '').trim().replace(/'/g, '');
    const clausulas: string[] = [];
    if (termo) {
      clausulas.push(CAMPOS_BUSCA.map((campo) => `${campo} ilike '*${termo}*'`).join(' or '));
    }
    if (tipo) {
      clausulas.push(`tipo eq '${tipo}'`);
    }
    if (!incluirInativos) {
      clausulas.push('ativo eq true');
    }
    return clausulas.join(' and ');
  }

  /** Ficha completa por id (`GET /processos/{id}`) — pro painel não depender da página carregada. */
  buscarCompleto(id: number): Observable<ProcessoApi | null> {
    return this.http.get<ProcessoApi>(`${this.base}/${id}`).pipe(catchError(() => of(null)));
  }

  /** `POST` (id 0) ou `PUT` (id existente); devolve a ficha e atualiza a linha na lista. */
  salvar(processo: ProcessoEditavel): Observable<ProcessoApi> {
    const body: ProcessoWriteApi = {
      tipo: processo.tipo,
      numero_cnj: vazioParaNull(processo.numeroCnj),
      status_id: processo.statusId,
      contrario_principal_nome: vazioParaNull(processo.contrarioPrincipalNome),
      contrario_principal_posicao_id: processo.contrarioPrincipalPosicaoId,
      contrario_principal_documento: onlyDigits(processo.contrarioPrincipalDocumento) || null,
      advogado_responsavel_id: processo.advogadoResponsavelId,
      data_distribuicao: vazioParaNull(processo.dataDistribuicao),
      acao_id: processo.acaoId,
      natureza_id: processo.naturezaId,
      procedimento_id: processo.procedimentoId,
      fase_id: processo.faseId,
      uf: vazioParaNull(processo.uf),
      cidade_id: processo.cidadeId,
      observacoes_gerais: vazioParaNull(processo.observacoesGerais),
      destacar_observacao: processo.destacarObservacao,
      objeto_principal: vazioParaNull(processo.objetoPrincipal),
      observacoes_objeto: vazioParaNull(processo.observacoesObjeto),
      valor_pedido: processo.valorPedido,
      valor_deferido: processo.valorDeferido,
      cenario_provavel: processo.cenarioProvavel,
      cenario_possivel: processo.cenarioPossivel,
      cenario_remoto: processo.cenarioRemoto,
      objetos_secundarios: processo.objetosSecundarios,
      clientes: processo.clientes,
      partes_contrarias: processo.partesContrarias,
      outros_envolvidos_advogados: processo.outrosEnvolvidosAdvogados,
      outros_envolvidos_magistrados: processo.outrosEnvolvidosMagistrados,
      outros_envolvidos_testemunhas: processo.outrosEnvolvidosTestemunhas,
      outros_envolvidos_peritos: processo.outrosEnvolvidosPeritos,
      outros_envolvidos_assistentes_tecnicos: processo.outrosEnvolvidosAssistentesTecnicos,
      tribunal_atual_id: processo.tribunalAtualId,
      orgao_processante_id: processo.orgaoProcessanteId,
      escritorios_anteriores: processo.escritoriosAnteriores,
      tags: processo.tags,
    };

    const request$ =
      processo.id > 0
        ? this.http.put<ProcessoApi>(`${this.base}/${processo.id}`, body)
        : this.http.post<ProcessoApi>(this.base, body);

    return request$.pipe(tap((salvo) => this.mesclarNaLista(salvo)));
  }

  /** Ativa/inativa via `PATCH /processos/{id}/status` (corpo `{ ativo }`) e substitui na lista. */
  alterarStatus(id: number, ativo: boolean): Observable<ProcessoApi> {
    return this.http
      .patch<ProcessoApi>(`${this.base}/${id}/status`, { ativo })
      .pipe(tap((atualizado) => this.mesclarNaLista(atualizado)));
  }

  /**
   * Alterna o favorito do processo (otimista): atualiza a lista na hora, dispara
   * `PATCH /processos/{id}/favorito` e desfaz se a API falhar. Devolve o estado desejado, ou
   * `null` se o processo não está carregado.
   */
  alternarFavorito(id: number): boolean | null {
    const atual = this._processos().find((p) => p.id === id);
    if (!atual) {
      return null;
    }
    const desejado = !atual.favorito;
    this.setFavoritoLocal(id, desejado);

    this.favoritoService
      .alternar('processos', id, desejado)
      .subscribe({ error: () => this.setFavoritoLocal(id, !desejado) });

    return desejado;
  }

  // --- rótulo por id (Cliente principal / Advogado responsável) — via /domain: nem
  // /api/v1/pessoas nem /api/v1/advogados (GET por id) existem mais — Pessoa e Advogado já
  // migraram a leitura pra /domain/pessoa e /domain/advogado. A busca em si (o picker) é o
  // `<app-domain-model-dropdown>` direto no template — isso aqui só resolve o `valueLabel` inicial
  // ao carregar uma ficha já persistida (a página do valor pode não estar carregada no dropdown).

  /** Rótulo de uma pessoa por id. */
  rotuloPessoa(id: number): Observable<string> {
    return this.domainService
      .get<Record<string, unknown>>({ entityName: 'pessoa', entityId: id, fields: 'id,nome,razaoSocial,nomeFantasia' })
      .pipe(map(nomeDePessoa), catchError(() => of('')));
  }

  rotuloAdvogado(id: number): Observable<string> {
    return this.domainService
      .get<Record<string, unknown>>({ entityName: 'advogado', entityId: id, fields: 'id,nome' })
      .pipe(map((a) => String(a['nome'] ?? '')), catchError(() => of('')));
  }

  /** Rótulo de uma posição do catálogo `posicao_cliente` por id — mesmo padrão de `rotuloPessoa`/`rotuloAdvogado`. */
  rotuloPosicaoCliente(id: number): Observable<string> {
    return this.domainService
      .get<Record<string, unknown>>({ entityName: 'posicao-cliente', entityId: id, fields: 'id,nome' })
      .pipe(map((p) => String(p['nome'] ?? '')), catchError(() => of('')));
  }

  // --- catálogos por id (Status/Ação/Natureza/Fase) — CRUD 100% via /domain, sem controller/
  // service dedicado no backend (mesmo id/nome dos 4, ver StatusProcesso/AcaoProcesso/
  // NaturezaProcesso/FaseProcesso). Excluir um valor em uso bloqueia (409, FK real) — ver V26.
  // A busca (picker) também é o `<app-domain-model-dropdown>` direto no template — só o
  // criar/renomear/excluir (sem equivalente genérico de escrita no componente) fica aqui.

  criarCatalogo(entityName: string, nome: string): Observable<CatalogoItem> {
    return this.domainService
      .post<{ nome: string }>({ entityName, body: { nome } })
      .pipe(switchMap((criado) => this.domainService.get<CatalogoItem>({ entityName, entityId: criado.id })));
  }

  renomearCatalogo(entityName: string, id: number, nome: string): Observable<CatalogoItem> {
    return this.domainService
      .patch({ entityName, entityId: id, body: { nome } })
      .pipe(switchMap(() => this.domainService.get<CatalogoItem>({ entityName, entityId: id })));
  }

  excluirCatalogo(entityName: string, id: number): Observable<void> {
    return this.domainService.delete({ entityName, entityId: id });
  }

  private mesclarNaLista(salvo: ProcessoApi): void {
    const linha = resumoDe(salvo);
    this._processos.update((processos) =>
      processos.some((p) => p.id === linha.id)
        ? processos.map((p) => (p.id === linha.id ? linha : p))
        : [linha, ...processos],
    );
  }

  private setFavoritoLocal(id: number, favorito: boolean): void {
    this._processos.update((processos) =>
      processos.map((p) => (p.id === id ? { ...p, favorito } : p)),
    );
  }
}

/** Nome de exibição de uma pessoa vinda de `/domain/pessoa` (física: `nome`; jurídica: `razaoSocial` / `nomeFantasia`). */
function nomeDePessoa(p: Record<string, unknown>): string {
  return String(p['nome'] ?? p['razaoSocial'] ?? p['nomeFantasia'] ?? '(sem nome)');
}

/** Deriva a linha da listagem a partir da ficha completa (pós-save). */
function resumoDe(p: ProcessoApi): ProcessoResumoApi {
  return {
    id: p.id,
    favorito: p.favorito,
    tipo: p.tipo,
    numero_cnj: p.numero_cnj,
    status: p.status,
    status_id: p.status_id,
    pasta: p.pasta,
    cliente_principal_id: p.clientes.find((c) => c.principal)?.pessoa_id ?? null,
    advogado_responsavel_id: p.advogado_responsavel_id,
    natureza: p.natureza,
    natureza_id: p.natureza_id,
    fase: p.fase,
    fase_id: p.fase_id,
    uf: p.uf,
    cidade: p.cidade,
    cidade_id: p.cidade_id,
    data_distribuicao: p.data_distribuicao,
    observacoes_gerais: p.observacoes_gerais,
    destacar_observacao: p.destacar_observacao,
    ativo: p.ativo,
    atualizado_em: p.atualizado_em,
  };
}
