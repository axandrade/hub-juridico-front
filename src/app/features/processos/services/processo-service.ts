import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, tap } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { ComboPagina } from '../../../shared/components/combobox/combobox.component';
import { FavoritoService } from '../../../shared/services/favorito.service';
import {
  CenarioRiscoApi,
  ClienteSecundarioApi,
  OutroEnvolvidoAdvogadoApi,
  OutroEnvolvidoMagistradoWriteApi,
  OutroEnvolvidoTestemunhaApi,
  PaginaApi,
  ParteContrariaApi,
  ProcessoApi,
  ProcessoResumoApi,
  ProcessoWriteApi,
  TipoProcesso,
} from './processo-api.model';
import { onlyDigits } from '../../../core/auth/documentos-br';

/**
 * Filtros do `GET /api/v1/processos` — todos reais no servidor: `busca` casa parcialmente em
 * número CNJ / status / natureza / ação / cidade; `tipo` é igualdade; `incluirInativos` (`false`
 * padrão) traz só `ativo = true`.
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
  status: string;

  clientePrincipalId: number | null;
  clientePrincipalPosicao: string;

  contrarioPrincipalNome: string;
  contrarioPrincipalPosicao: string;
  /** CPF ou CNPJ (mascarado ou não) — o serviço manda só os dígitos. */
  contrarioPrincipalDocumento: string;

  advogadoResponsavelId: number | null;
  dataDistribuicao: string;
  acao: string;
  natureza: string;
  procedimento: string;
  fase: string;
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
  /** Id do catálogo `orgao_julgador` (chave estrangeira) — escolhido via cascata Tribunal→Órgão. */
  orgaoProcessanteId: number | null;
  escritoriosAnteriores: string[];
  /** Advogados "outros envolvidos" (aba "Outros envolvidos"). */
  outrosEnvolvidosAdvogados: OutroEnvolvidoAdvogadoApi[];
  /** Magistrados "outros envolvidos" (aba "Outros envolvidos"). */
  outrosEnvolvidosMagistrados: OutroEnvolvidoMagistradoWriteApi[];
  /** Testemunhas "outros envolvidos" (aba "Outros envolvidos"). */
  outrosEnvolvidosTestemunhas: OutroEnvolvidoTestemunhaApi[];
  /** Preservados como vieram — ainda sem UI de edição nesta fatia. */
  clientesSecundarios: ClienteSecundarioApi[];
  partesContrarias: ParteContrariaApi[];
}

const vazioParaNull = (valor: string): string | null => valor.trim() || null;

/**
 * Fonte da lista de processos. Fala com `/api/v1/processos` (Spring), paginado de 10 em 10, e faz
 * o CRUD de escrita (criar/editar/status) consumido pelo painel `app-processo-form`. Também
 * resolve os pickers de Cliente principal / Advogado responsável — busca paginada no servidor
 * (`buscarPessoas` / `buscarAdvogados`), pra alimentar o `<app-combobox>` sem `findAll`.
 */
@Injectable({ providedIn: 'root' })
export class ProcessoService {
  private readonly http = inject(HttpClient);
  private readonly favoritoService = inject(FavoritoService);
  private readonly base = `${environment.apiBaseUrl}/processos`;
  private readonly pessoasUrl = `${environment.apiBaseUrl}/pessoas`;
  private readonly advogadosUrl = `${environment.apiBaseUrl}/advogados`;

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
    let params = new HttpParams().set('page', query.page).set('size', ProcessoService.PAGE_SIZE);
    if (query.busca?.trim()) {
      params = params.set('busca', query.busca.trim());
    }
    if (query.tipo) {
      params = params.set('tipo', query.tipo);
    }
    if (query.incluirInativos) {
      params = params.set('incluirInativos', true);
    }

    return this.http.get<PaginaApi<ProcessoResumoApi>>(this.base, { params }).pipe(
      tap((pagina) => {
        this._page.set(pagina.pagina ?? 0);
        this._totalPages.set(pagina.total_paginas ?? 1);
        this._totalElements.set(pagina.total_elementos ?? 0);
        this._last.set(pagina.ultima ?? true);
      }),
      map((pagina) => pagina.conteudo ?? []),
      tap((processos) => this._processos.set(processos)),
    );
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
      status: vazioParaNull(processo.status),
      cliente_principal_id: processo.clientePrincipalId,
      cliente_principal_posicao: vazioParaNull(processo.clientePrincipalPosicao),
      contrario_principal_nome: vazioParaNull(processo.contrarioPrincipalNome),
      contrario_principal_posicao: vazioParaNull(processo.contrarioPrincipalPosicao),
      contrario_principal_documento: onlyDigits(processo.contrarioPrincipalDocumento) || null,
      advogado_responsavel_id: processo.advogadoResponsavelId,
      data_distribuicao: vazioParaNull(processo.dataDistribuicao),
      acao: vazioParaNull(processo.acao),
      natureza: vazioParaNull(processo.natureza),
      procedimento: vazioParaNull(processo.procedimento),
      fase: vazioParaNull(processo.fase),
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
      clientes_secundarios: processo.clientesSecundarios,
      partes_contrarias: processo.partesContrarias,
      outros_envolvidos_advogados: processo.outrosEnvolvidosAdvogados,
      outros_envolvidos_magistrados: processo.outrosEnvolvidosMagistrados,
      outros_envolvidos_testemunhas: processo.outrosEnvolvidosTestemunhas,
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

  // --- pickers de vínculo (Cliente principal / Advogado responsável) ---

  /** Página de pessoas para o `<app-combobox [buscarPagina]>` (valor = id, rótulo = nome). */
  buscarPessoas = (termo: string, pagina: number): Observable<ComboPagina> =>
    this.paginaVinculo(this.pessoasUrl, termo, pagina, (p) => nomeDePessoa(p));

  /** Página de advogados para o picker. */
  buscarAdvogados = (termo: string, pagina: number): Observable<ComboPagina> =>
    this.paginaVinculo(this.advogadosUrl, termo, pagina, (a) => String(a['nome'] ?? '(sem nome)'));

  /** Rótulo de uma pessoa por id (`valueLabel` do combobox quando a página dela não carregou). */
  rotuloPessoa(id: number): Observable<string> {
    return this.http.get<Record<string, unknown>>(`${this.pessoasUrl}/${id}`).pipe(
      map(nomeDePessoa),
      catchError(() => of('')),
    );
  }

  rotuloAdvogado(id: number): Observable<string> {
    return this.http.get<Record<string, unknown>>(`${this.advogadosUrl}/${id}`).pipe(
      map((a) => String(a['nome'] ?? '')),
      catchError(() => of('')),
    );
  }

  private paginaVinculo(
    url: string,
    termo: string,
    pagina: number,
    rotulo: (item: Record<string, unknown>) => string,
  ): Observable<ComboPagina> {
    let params = new HttpParams().set('page', pagina).set('size', ProcessoService.PAGE_SIZE);
    if (termo.trim()) {
      params = params.set('busca', termo.trim());
    }
    return this.http.get<PaginaApi<Record<string, unknown>>>(url, { params }).pipe(
      map((p) => ({
        itens: (p.conteudo ?? []).map((item) => ({
          valor: String(item['id']),
          rotulo: rotulo(item),
        })),
        ultima: p.ultima ?? true,
      })),
    );
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

/** Nome de exibição de uma pessoa (física: `nome`; jurídica: `razao_social` / `nome_fantasia`). */
function nomeDePessoa(p: Record<string, unknown>): string {
  return String(p['nome'] ?? p['razao_social'] ?? p['nome_fantasia'] ?? '(sem nome)');
}

/** Deriva a linha da listagem a partir da ficha completa (pós-save). */
function resumoDe(p: ProcessoApi): ProcessoResumoApi {
  return {
    id: p.id,
    favorito: p.favorito,
    tipo: p.tipo,
    numero_cnj: p.numero_cnj,
    status: p.status,
    pasta: p.pasta,
    cliente_principal_id: p.cliente_principal_id,
    advogado_responsavel_id: p.advogado_responsavel_id,
    natureza: p.natureza,
    fase: p.fase,
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
