import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, forkJoin, map, of, switchMap, tap } from 'rxjs';

import { DomainFavoritoService } from '../../../core/services/domain-favorito.service';
import { DomainService, IDomainPage } from '../../../core/services/domain.service';
import {
  CenarioRiscoApi,
  ClienteProcessoApi,
  MagistradoAtualApi,
  ObservacaoProcessoApi,
  OrgaoProcessanteApi,
  OutroEnvolvidoAdvogadoApi,
  OutroEnvolvidoAssistenteTecnicoApi,
  OutroEnvolvidoMagistradoApi,
  OutroEnvolvidoMagistradoWriteApi,
  OutroEnvolvidoPeritoApi,
  OutroEnvolvidoPeritoWriteApi,
  OutroEnvolvidoTestemunhaApi,
  ParteContrariaApi,
  PeritoAtualApi,
  ProcessoApi,
  ProcessoResumoApi,
  ProcessoTribunalHistoricoApi,
  ProcessoWriteApi,
  TipoProcesso,
  TribunalAtualApi,
} from './processo-api.model';

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
  /** Lista de partes contrárias do processo — uma delas (`principal: true`) é a principal. */
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
  orgaoProcessanteId: number | null;
  /** Cache de texto (não id) — parte contrária não referencia `Pessoa` (ver `Processo.parteContrariaPrincipal` no backend). */
  parteContrariaPrincipal: string | null;
  advogadoResponsavelId: number | null;
  acao: string | null;
  acaoId: number | null;
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

// ==========================================================================================
// Ficha completa (buscarCompleto) — desde que `ProcessoController.buscarPorId` foi eliminado
// (2026-09-18), a ficha vem de `/domain/processo/{id}` (cru, camelCase, ids soltos) + resolução
// à parte de tudo que o `ProcessoResponse` do backend costumava "joinar": nome de
// magistrado/perito, tribunal/órgão atual (com fallback pro último do histórico, mesma regra de
// `ProcessoService.tribunalAtualEfetivoId`/`orgaoProcessanteEfetivoId`), nomes do histórico de
// tribunais e o favorito do usuário logado. Monta exatamente o mesmo formato de `ProcessoApi` no
// final — nenhum componente consumidor mudou.
// ==========================================================================================

interface CenarioRiscoDomain {
  valor: number | null;
  percentual: number | null;
  provisionar: boolean;
}

interface ClienteProcessoDomain {
  pessoaId: number;
  posicaoId: number | null;
  principal: boolean;
}

interface ParteContrariaDomain {
  nome: string;
  posicaoId: number | null;
  documento: string | null;
  principal: boolean;
}

interface OutroEnvolvidoAdvogadoDomain {
  advogado: string;
  posicao: string | null;
  oab: string | null;
  uf: string | null;
}

interface OutroEnvolvidoMagistradoDomain {
  magistradoId: number;
  resultado: string | null;
  orgaoId: number | null;
  data: string;
}

interface OutroEnvolvidoTestemunhaDomain {
  testemunha: string;
  cpf: string | null;
  parteInteressada: string;
}

interface OutroEnvolvidoPeritoDomain {
  peritoId: number;
  resultado: string | null;
}

interface OutroEnvolvidoAssistenteTecnicoDomain {
  assistenteTecnico: string;
  cpf: string | null;
  parteInteressada: string;
}

interface ObservacaoProcessoDomain {
  data: string;
  autorId: number | null;
  autorNome: string | null;
  texto: string;
}

interface ProcessoTribunalHistoricoDomain {
  tribunalId: number;
  orgaoId: number | null;
  data: string;
  autorId: number | null;
}

/** Linha crua de `/domain/processo/{id}` (ficha completa) — camelCase, sem nenhum nome resolvido. */
interface ProcessoDomainRaw {
  id: number;
  tipo: TipoProcesso;
  numeroCnj: string | null;
  status: string | null;
  statusId: number | null;
  pasta: string | null;
  advogadoResponsavelId: number | null;
  dataDistribuicao: string | null;
  acao: string | null;
  acaoId: number | null;
  natureza: string | null;
  naturezaId: number | null;
  procedimento: string | null;
  procedimentoId: number | null;
  fase: string | null;
  faseId: number | null;
  uf: string | null;
  cidade: string | null;
  cidadeId: number | null;
  observacoesGerais: string | null;
  destacarObservacao: boolean;
  objetoPrincipal: string | null;
  observacoesObjeto: string | null;
  valorPedido: number | null;
  valorDeferido: number | null;
  cenarioProvavel: CenarioRiscoDomain;
  cenarioPossivel: CenarioRiscoDomain;
  cenarioRemoto: CenarioRiscoDomain;
  objetosSecundarios: string[];
  clientes: ClienteProcessoDomain[];
  partesContrarias: ParteContrariaDomain[];
  outrosEnvolvidosAdvogados: OutroEnvolvidoAdvogadoDomain[];
  outrosEnvolvidosMagistrados: OutroEnvolvidoMagistradoDomain[];
  outrosEnvolvidosTestemunhas: OutroEnvolvidoTestemunhaDomain[];
  outrosEnvolvidosPeritos: OutroEnvolvidoPeritoDomain[];
  outrosEnvolvidosAssistentesTecnicos: OutroEnvolvidoAssistenteTecnicoDomain[];
  tribunalAtualId: number | null;
  orgaoProcessanteId: number | null;
  escritoriosAnteriores: string[];
  tags: string[];
  observacoesPrevias: ObservacaoProcessoDomain[];
  tribunaisHistorico: ProcessoTribunalHistoricoDomain[];
  ativo: boolean;
  atualizadoEm: string | null;
}

const cenarioApiDe = (c: CenarioRiscoDomain): CenarioRiscoApi => ({
  valor: c.valor,
  percentual: c.percentual,
  provisionar: c.provisionar,
});

/**
 * `/domain/processo/{id}` sem `fields` explícito omite TODA coleção `@ElementCollection` não
 * carregada (mesmo com dado — é assim que o dump por reflexão do ddd-noap funciona, verificado
 * direto na API: sem isso `clientes`/`outrosEnvolvidosMagistrados`/`tribunaisHistorico` etc.
 * simplesmente não vêm no JSON). Pedir os campos explicitamente resolve pros não-vazios; um
 * vazio continua ausente de qualquer jeito — por isso `normalizarRaw` ainda é necessário.
 */
const PROCESSO_FICHA_FIELDS = [
  'id', 'tipo', 'numeroCnj', 'status', 'statusId', 'pasta', 'advogadoResponsavelId', 'dataDistribuicao',
  'acao', 'acaoId', 'natureza', 'naturezaId', 'procedimento', 'procedimentoId', 'fase', 'faseId',
  'uf', 'cidade', 'cidadeId', 'observacoesGerais', 'destacarObservacao',
  'objetoPrincipal', 'observacoesObjeto', 'valorPedido', 'valorDeferido',
  'cenarioProvavel', 'cenarioPossivel', 'cenarioRemoto', 'objetosSecundarios',
  'clientes', 'partesContrarias', 'outrosEnvolvidosAdvogados', 'outrosEnvolvidosMagistrados',
  'outrosEnvolvidosTestemunhas', 'outrosEnvolvidosPeritos', 'outrosEnvolvidosAssistentesTecnicos',
  'tribunalAtualId', 'orgaoProcessanteId', 'escritoriosAnteriores', 'tags',
  'observacoesPrevias', 'tribunaisHistorico', 'ativo', 'atualizadoEm',
].join(',');

/** Preenche com `[]` toda coleção que o backend omitiu por estar vazia (ver `PROCESSO_FICHA_FIELDS`). */
function normalizarRaw(raw: ProcessoDomainRaw): ProcessoDomainRaw {
  return {
    ...raw,
    objetosSecundarios: raw.objetosSecundarios ?? [],
    clientes: raw.clientes ?? [],
    partesContrarias: raw.partesContrarias ?? [],
    outrosEnvolvidosAdvogados: raw.outrosEnvolvidosAdvogados ?? [],
    outrosEnvolvidosMagistrados: raw.outrosEnvolvidosMagistrados ?? [],
    outrosEnvolvidosTestemunhas: raw.outrosEnvolvidosTestemunhas ?? [],
    outrosEnvolvidosPeritos: raw.outrosEnvolvidosPeritos ?? [],
    outrosEnvolvidosAssistentesTecnicos: raw.outrosEnvolvidosAssistentesTecnicos ?? [],
    escritoriosAnteriores: raw.escritoriosAnteriores ?? [],
    tags: raw.tags ?? [],
    observacoesPrevias: raw.observacoesPrevias ?? [],
    tribunaisHistorico: raw.tribunaisHistorico ?? [],
  };
}

/** Deduplica e remove `null`/`undefined` — usado pra montar os filtros `id eq X or id eq Y...`. */
function idsUnicos(ids: (number | null | undefined)[]): number[] {
  return [...new Set(ids.filter((id): id is number => id != null))];
}

/**
 * Monta o `ProcessoApi` final a partir da ficha crua + catálogos resolvidos em lote — replica
 * `ProcessoService.toResponse`/`resolverTribunalAtual`/`resolverOrgaoProcessante`/
 * `resolverMagistrados`/`resolverPeritos`/`resolverTribunaisHistorico` do backend (formato
 * "TRIBUNAL - descrição" só no órgão processante/magistrados — `tribunais_historico.orgao_nome`
 * usa o nome cru do catálogo, sem prefixo, mesma regra de `ProcessoTribunalHistoricoResponse`).
 */
function montarProcessoApi(
  id: number,
  raw: ProcessoDomainRaw,
  favorito: boolean,
  magistrados: Map<number, MagistradoAtualApi>,
  peritos: Map<number, PeritoAtualApi>,
  orgaos: Map<number, { id: number; nome: string; tribunalId: number }>,
  tribunais: Map<number, TribunalAtualApi>,
  tribunalEfetivoId: number | null,
  orgaoEfetivoId: number | null,
): ProcessoApi {
  const orgaoProcessanteApiDe = (orgaoId: number | null): OrgaoProcessanteApi | null => {
    const orgao = orgaoId != null ? orgaos.get(orgaoId) : undefined;
    if (!orgao) {
      return null;
    }
    const tribunalNome = tribunais.get(orgao.tribunalId)?.nome ?? null;
    return {
      id: orgao.id,
      nome: tribunalNome ? `${tribunalNome} - ${orgao.nome}` : orgao.nome,
      tribunal_id: orgao.tribunalId,
    };
  };

  const outrosEnvolvidosMagistrados: OutroEnvolvidoMagistradoApi[] = raw.outrosEnvolvidosMagistrados.map((m) => ({
    magistrado: magistrados.get(m.magistradoId) ?? null,
    resultado: m.resultado,
    orgao: orgaoProcessanteApiDe(m.orgaoId),
    data: m.data,
  }));

  const outrosEnvolvidosPeritos: OutroEnvolvidoPeritoApi[] = raw.outrosEnvolvidosPeritos.map((p) => ({
    perito: peritos.get(p.peritoId) ?? null,
    resultado: p.resultado,
  }));

  const observacoesPrevias: ObservacaoProcessoApi[] = raw.observacoesPrevias.map((o) => ({
    data: o.data,
    autor_id: o.autorId,
    autor_nome: o.autorNome,
    texto: o.texto,
  }));

  const tribunaisHistorico: ProcessoTribunalHistoricoApi[] = raw.tribunaisHistorico.map((h) => ({
    data: h.data,
    tribunal_nome: tribunais.get(h.tribunalId)?.nome ?? null,
    orgao_nome: (h.orgaoId != null ? orgaos.get(h.orgaoId)?.nome : null) ?? null,
  }));

  return {
    id: raw.id,
    favorito,
    tipo: raw.tipo,
    numero_cnj: raw.numeroCnj,
    status: raw.status,
    status_id: raw.statusId,
    pasta: raw.pasta,

    advogado_responsavel_id: raw.advogadoResponsavelId,
    data_distribuicao: raw.dataDistribuicao,
    acao: raw.acao,
    acao_id: raw.acaoId,
    natureza: raw.natureza,
    natureza_id: raw.naturezaId,
    procedimento: raw.procedimento,
    procedimento_id: raw.procedimentoId,
    fase: raw.fase,
    fase_id: raw.faseId,
    uf: raw.uf,
    cidade: raw.cidade,
    cidade_id: raw.cidadeId,
    observacoes_gerais: raw.observacoesGerais,
    destacar_observacao: raw.destacarObservacao,

    objeto_principal: raw.objetoPrincipal,
    observacoes_objeto: raw.observacoesObjeto,
    valor_pedido: raw.valorPedido,
    valor_deferido: raw.valorDeferido,
    cenario_provavel: cenarioApiDe(raw.cenarioProvavel),
    cenario_possivel: cenarioApiDe(raw.cenarioPossivel),
    cenario_remoto: cenarioApiDe(raw.cenarioRemoto),
    objetos_secundarios: raw.objetosSecundarios,

    clientes: raw.clientes.map((c) => ({ pessoa_id: c.pessoaId, posicao_id: c.posicaoId, principal: c.principal })),
    partes_contrarias: raw.partesContrarias.map((p) => ({
      nome: p.nome,
      posicao_id: p.posicaoId,
      documento: p.documento,
      principal: p.principal,
    })),
    outros_envolvidos_advogados: raw.outrosEnvolvidosAdvogados.map((o) => ({
      advogado: o.advogado,
      posicao: o.posicao,
      oab: o.oab,
      uf: o.uf,
    })),
    outros_envolvidos_magistrados: outrosEnvolvidosMagistrados,
    outros_envolvidos_testemunhas: raw.outrosEnvolvidosTestemunhas.map((t) => ({
      testemunha: t.testemunha,
      cpf: t.cpf,
      parte_interessada: t.parteInteressada,
    })),
    outros_envolvidos_peritos: outrosEnvolvidosPeritos,
    outros_envolvidos_assistentes_tecnicos: raw.outrosEnvolvidosAssistentesTecnicos.map((a) => ({
      assistente_tecnico: a.assistenteTecnico,
      cpf: a.cpf,
      parte_interessada: a.parteInteressada,
    })),
    tribunal_atual: tribunalEfetivoId != null ? tribunais.get(tribunalEfetivoId) ?? null : null,
    orgao_processante: orgaoProcessanteApiDe(orgaoEfetivoId),
    escritorios_anteriores: raw.escritoriosAnteriores,
    tags: raw.tags,
    observacoes_previas: observacoesPrevias,
    tribunais_historico: tribunaisHistorico,

    ativo: raw.ativo,
    atualizado_em: raw.atualizadoEm,
  };
}

const PROCESSO_RESUMO_FIELDS = [
  'id', 'tipo', 'numeroCnj', 'status', 'statusId', 'pasta', 'clientePrincipalId', 'orgaoProcessanteId',
  'parteContrariaPrincipal', 'advogadoResponsavelId', 'acao', 'acaoId', 'natureza', 'naturezaId', 'fase',
  'faseId', 'uf', 'cidade', 'cidadeId', 'dataDistribuicao', 'observacoesGerais', 'destacarObservacao',
  'ativo', 'atualizadoEm',
].join(',');

function processoResumoFromDomain(
  p: ProcessoResumoDomain,
  favorito: boolean,
  clientePrincipalNome: string | null,
  orgaoProcessanteNome: string | null,
): ProcessoResumoApi {
  return {
    id: p.id,
    favorito,
    tipo: p.tipo,
    numero_cnj: p.numeroCnj,
    status: p.status,
    status_id: p.statusId,
    pasta: p.pasta,
    cliente_principal_id: p.clientePrincipalId,
    cliente_principal_nome: clientePrincipalNome,
    orgao_processante_nome: orgaoProcessanteNome,
    parte_contraria_principal_nome: p.parteContrariaPrincipal,
    advogado_responsavel_id: p.advogadoResponsavelId,
    acao: p.acao,
    acao_id: p.acaoId,
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
 * Criar/editar/ativar-inativar vão direto por `/domain/processo` (`DomainService.post`/`patch`,
 * sem `ProcessoController.criar`/`atualizar`/`alterarStatus` — ver
 * `Processo.criarProcesso`/`atualizarProcesso` no backend, mesmo padrão de Advogado/Pessoa). Os
 * pickers de Clientes (lista, ver `ProcessoClientesComponent`)
 * / Advogado responsável / Status / Ação / Natureza / Fase são `<app-domain-model-dropdown>` direto
 * no template (busca própria via `/domain`); aqui só ficam `rotuloPessoa`/`rotuloAdvogado`/
 * `rotuloPosicaoCliente` (resolvem o `valueLabel` inicial ao carregar uma ficha) e
 * `criarCatalogo`/`renomearCatalogo`/`excluirCatalogo` (escrita dos catálogos, sem equivalente
 * genérico no componente de dropdown).
 */
@Injectable({ providedIn: 'root' })
export class ProcessoService {
  private readonly domainService = inject(DomainService);
  private readonly domainFavoritoService = inject(DomainFavoritoService);

  static readonly PAGE_SIZE = 10;

  private readonly _processos = signal<ProcessoResumoApi[]>([]);
  readonly processos = this._processos.asReadonly();

  /** Id da linha `Favorito` (não do processo) por id de processo — necessário pra desfavoritar via `DomainFavoritoService`. */
  private readonly _favoritoIds = signal<Map<number, number>>(new Map());

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
          const clienteIds = idsUnicos(pagina.content.map((p) => p.clientePrincipalId));
          const orgaoIds = idsUnicos(pagina.content.map((p) => p.orgaoProcessanteId));
          return this.domainFavoritoService.listarFavoritos('processo', ids).pipe(
            switchMap((favoritos) => {
              this.mesclarFavoritoIds(favoritos);
              return forkJoin({
                nomesClientes: this.buscarNomesPessoas(clienteIds),
                nomesOrgaos: this.buscarNomesOrgaos(orgaoIds),
              }).pipe(
                map(({ nomesClientes, nomesOrgaos }) =>
                  pagina.content.map((p) =>
                    processoResumoFromDomain(
                      p,
                      favoritos.has(p.id),
                      p.clientePrincipalId != null ? nomesClientes.get(p.clientePrincipalId) ?? null : null,
                      p.orgaoProcessanteId != null ? nomesOrgaos.get(p.orgaoProcessanteId) ?? null : null,
                    ),
                  ),
                ),
              );
            }),
          );
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

  /**
   * Ficha completa por id — pro painel não depender da página carregada. Vai em
   * `/domain/processo/{id}` (cru) + resolve à parte tudo que o antigo `GET /processos/{id}`
   * devolvia pronto (nomes de magistrado/perito/tribunal/órgão, histórico, favorito) — ver o
   * bloco de comentário acima de `ProcessoDomainRaw`.
   */
  buscarCompleto(id: number): Observable<ProcessoApi | null> {
    return this.domainService
      .get<ProcessoDomainRaw>({ entityName: 'processo', entityId: id, fields: PROCESSO_FICHA_FIELDS })
      .pipe(
        switchMap((raw) => this.montarFichaCompleta(id, normalizarRaw(raw))),
        catchError(() => of(null)),
      );
  }

  private montarFichaCompleta(id: number, raw: ProcessoDomainRaw): Observable<ProcessoApi> {
    const ultimoHistorico = [...raw.tribunaisHistorico].sort((a, b) => a.data.localeCompare(b.data)).at(-1) ?? null;
    const tribunalEfetivoId = raw.tribunalAtualId ?? ultimoHistorico?.tribunalId ?? null;
    const orgaoEfetivoId =
      raw.orgaoProcessanteId ?? (raw.tribunalAtualId != null ? null : ultimoHistorico?.orgaoId ?? null);

    const magistradoIds = idsUnicos(raw.outrosEnvolvidosMagistrados.map((m) => m.magistradoId));
    const peritoIds = idsUnicos(raw.outrosEnvolvidosPeritos.map((p) => p.peritoId));
    const orgaoIds = idsUnicos([
      orgaoEfetivoId,
      ...raw.outrosEnvolvidosMagistrados.map((m) => m.orgaoId),
      ...raw.tribunaisHistorico.map((h) => h.orgaoId),
    ]);

    return forkJoin({
      magistrados: this.buscarCatalogoPorIds<{ id: number; nome: string }>('magistrado', 'id,nome', magistradoIds),
      peritos: this.buscarCatalogoPorIds<{ id: number; nome: string; cpf: string | null }>(
        'perito', 'id,nome,cpf', peritoIds),
      orgaos: this.buscarCatalogoPorIds<{ id: number; nome: string; tribunalId: number }>(
        'orgao-julgador', 'id,nome,tribunalId', orgaoIds),
      favoritos: this.domainFavoritoService.listarFavoritos('processo', [id]),
    }).pipe(
      switchMap(({ magistrados, peritos, orgaos, favoritos }) => {
        this.mesclarFavoritoIds(favoritos);
        const tribunalIds = idsUnicos([
          tribunalEfetivoId,
          ...raw.tribunaisHistorico.map((h) => h.tribunalId),
          ...[...orgaos.values()].map((o) => o.tribunalId),
        ]);
        return this.buscarCatalogoPorIds<{ id: number; nome: string }>('tribunal', 'id,nome', tribunalIds).pipe(
          map((tribunais) =>
            montarProcessoApi(
              id, raw, favoritos.has(id), magistrados, peritos, orgaos, tribunais, tribunalEfetivoId, orgaoEfetivoId,
            ),
          ),
        );
      }),
    );
  }

  /** Busca em lote por id (`id eq X or id eq Y...`) — mesmo padrão de `DomainFavoritoService.listarFavoritos`. */
  private buscarCatalogoPorIds<T extends { id: number }>(
    entityName: string, fields: string, ids: number[],
  ): Observable<Map<number, T>> {
    if (ids.length === 0) {
      return of(new Map());
    }
    const filter = ids.map((id) => `id eq ${id}`).join(' or ');
    return this.domainService
      .get<IDomainPage<T>>({ entityName, fields, filter, size: ids.length })
      .pipe(map((pagina) => new Map(pagina.content.map((item) => [item.id, item]))));
  }

  /** `POST` (id 0) ou `PUT` (id existente); devolve a ficha e atualiza a linha na lista. */
  salvar(processo: ProcessoEditavel): Observable<ProcessoApi> {
    const body: ProcessoWriteApi = {
      tipo: processo.tipo,
      numero_cnj: vazioParaNull(processo.numeroCnj),
      status_id: processo.statusId,
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

    // Criar (POST) e editar (PATCH) vão direto em /domain/processo — sem
    // ProcessoController.criar/atualizar/buscarPorId, ver Processo.criarProcesso/atualizarProcesso
    // no backend (mesmo padrão de Advogado/Pessoa). Os dois só devolvem `{id}`/204, então sempre
    // encadeia `buscarCompleto` (mesma resolução cliente-side usada pelo painel) pra pegar o que
    // a lista/painel precisa exibir.
    const request$ =
      processo.id > 0
        ? this.domainService
            .patch<ProcessoWriteApi>({ entityName: 'processo', entityId: processo.id, body })
            .pipe(switchMap(() => this.buscarCompleto(processo.id)))
        : this.domainService
            .post<ProcessoWriteApi>({ entityName: 'processo', body })
            .pipe(switchMap((criado) => this.buscarCompleto(criado.id)));

    return request$.pipe(
      switchMap((salvo) => {
        if (!salvo) {
          throw new Error('Falha ao recarregar o processo salvo.');
        }
        return of(salvo);
      }),
      switchMap((salvo) => this.mesclarNaLista(salvo).pipe(map(() => salvo))),
    );
  }

  /**
   * Ativa/inativa via `PATCH /domain/processo/{id}` (campo `ativo` direto — sem
   * `ProcessoController.alterarStatus`/`ProcessoService.alterarStatus` desde 2026-09-18, mesmo
   * padrão de `AdvogadoFormComponent.alterarStatus`/`ClientFormComponent.applyStatusChange`) e
   * substitui na lista.
   */
  alterarStatus(id: number, ativo: boolean): Observable<ProcessoApi> {
    return this.domainService.patch({ entityName: 'processo', entityId: id, body: { ativo } }).pipe(
      switchMap(() => this.buscarCompleto(id)),
      switchMap((atualizado) => {
        if (!atualizado) {
          throw new Error('Falha ao recarregar o processo atualizado.');
        }
        return of(atualizado);
      }),
      switchMap((atualizado) => this.mesclarNaLista(atualizado).pipe(map(() => atualizado))),
    );
  }

  /**
   * Alterna o favorito do processo (otimista): atualiza a lista na hora, favorita/desfavorita
   * via `/domain/favorito` (mesmo mecanismo genérico de Pessoa/Advogado — ver
   * `DomainFavoritoService`, sem `ProcessoController.definirFavorito` desde 2026-09-18) e desfaz
   * se a API falhar. Devolve o estado desejado, ou `null` se o processo não está carregado.
   */
  alternarFavorito(id: number): boolean | null {
    const atual = this._processos().find((p) => p.id === id);
    if (!atual) {
      return null;
    }
    const desejado = !atual.favorito;
    const existingFavoritoId = this._favoritoIds().get(id);
    this.setFavoritoLocal(id, desejado);

    const request$: Observable<number | null> = existingFavoritoId != null
      ? this.domainFavoritoService.desfavoritar(existingFavoritoId).pipe(map(() => null))
      : this.domainFavoritoService.favoritar('processo', id);

    request$.subscribe({
      next: (novoId) => this.mesclarFavoritoId(id, novoId),
      error: () => this.setFavoritoLocal(id, !desejado),
    });

    return desejado;
  }

  private mesclarFavoritoIds(favoritos: Map<number, number>): void {
    if (favoritos.size === 0) {
      return;
    }
    this._favoritoIds.update((atual) => new Map([...atual, ...favoritos]));
  }

  private mesclarFavoritoId(processoId: number, favoritoId: number | null): void {
    this._favoritoIds.update((atual) => {
      const proximo = new Map(atual);
      if (favoritoId == null) {
        proximo.delete(processoId);
      } else {
        proximo.set(processoId, favoritoId);
      }
      return proximo;
    });
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

  /** Nomes de várias pessoas por id, em lote — mesmo padrão de `buscarCatalogoPorIds`, usado pela coluna "Cliente principal". */
  private buscarNomesPessoas(ids: number[]): Observable<Map<number, string>> {
    return this.buscarCatalogoPorIds<Record<string, unknown> & { id: number }>(
      'pessoa', 'id,nome,razaoSocial,nomeFantasia', ids,
    ).pipe(map((mapa) => new Map([...mapa].map(([id, pessoa]) => [id, nomeDePessoa(pessoa)]))));
  }

  /**
   * Nomes de vários órgãos processantes por id, em lote, já no formato "TRIBUNAL - descrição" —
   * mesma composição de `orgaoProcessanteApiDe` (usada na ficha completa), usada pela coluna
   * "Último órgão".
   */
  private buscarNomesOrgaos(ids: number[]): Observable<Map<number, string>> {
    return this.buscarCatalogoPorIds<{ id: number; nome: string; tribunalId: number }>(
      'orgao-julgador', 'id,nome,tribunalId', ids,
    ).pipe(
      switchMap((orgaos) => {
        const tribunalIds = idsUnicos([...orgaos.values()].map((o) => o.tribunalId));
        return this.buscarCatalogoPorIds<{ id: number; nome: string }>('tribunal', 'id,nome', tribunalIds).pipe(
          map((tribunais) => new Map(
            [...orgaos].map(([id, orgao]) => {
              const tribunalNome = tribunais.get(orgao.tribunalId)?.nome ?? null;
              return [id, tribunalNome ? `${tribunalNome} - ${orgao.nome}` : orgao.nome] as const;
            }),
          )),
        );
      }),
    );
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

  /** Resolve o nome do cliente principal (se houver) e substitui/insere a linha na lista. */
  private mesclarNaLista(salvo: ProcessoApi): Observable<void> {
    const clienteId = salvo.clientes.find((c) => c.principal)?.pessoa_id ?? null;
    const nome$: Observable<string | null> = clienteId != null ? this.rotuloPessoa(clienteId) : of(null);
    return nome$.pipe(
      tap((nome) => {
        const linha = resumoDe(salvo, nome);
        this._processos.update((processos) =>
          processos.some((p) => p.id === linha.id)
            ? processos.map((p) => (p.id === linha.id ? linha : p))
            : [linha, ...processos],
        );
      }),
      map(() => undefined),
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

/** Deriva a linha da listagem a partir da ficha completa (pós-save). `clienteNome` vem resolvido à parte por `mesclarNaLista`. */
function resumoDe(p: ProcessoApi, clienteNome: string | null): ProcessoResumoApi {
  return {
    id: p.id,
    favorito: p.favorito,
    tipo: p.tipo,
    numero_cnj: p.numero_cnj,
    status: p.status,
    status_id: p.status_id,
    pasta: p.pasta,
    cliente_principal_id: p.clientes.find((c) => c.principal)?.pessoa_id ?? null,
    cliente_principal_nome: clienteNome,
    // `orgao_processante` já vem resolvido (com o "TRIBUNAL - descrição") na ficha completa — sem busca extra.
    orgao_processante_nome: p.orgao_processante?.nome ?? null,
    parte_contraria_principal_nome: p.partes_contrarias.find((pc) => pc.principal)?.nome ?? null,
    advogado_responsavel_id: p.advogado_responsavel_id,
    acao: p.acao,
    acao_id: p.acao_id,
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
