import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, tap } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { ComboPagina } from '../../../shared/components/combobox/combobox.component';
import { PaginaApi } from './processo-api.model';

/** Um município do catálogo `cidades` (`GET /api/v1/cidades`). */
export interface Cidade {
  id: number;
  nome: string;
  uf: string;
}

/**
 * Catálogo de municípios (Spring `/api/v1/cidades`, só leitura). Alimenta o picker paginado
 * "Comarca / Cidade" do processo (`[buscarPagina]` do `<app-combobox>`, valor = id, rótulo =
 * "Nome — UF") e resolve `{nome, uf}` de um id — do cache das páginas já vistas ou do servidor —
 * para o formulário preencher a UF ao escolher a cidade.
 */
@Injectable({ providedIn: 'root' })
export class CidadeService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/cidades`;
  private readonly vistas = new Map<number, Cidade>();

  static readonly PAGE_SIZE = 10;

  /** Página de cidades para o `<app-combobox [buscarPagina]>`. */
  buscarPagina = (termo: string, pagina: number): Observable<ComboPagina> => {
    let params = new HttpParams().set('page', pagina).set('size', CidadeService.PAGE_SIZE);
    if (termo.trim()) {
      params = params.set('busca', termo.trim());
    }
    return this.http.get<PaginaApi<Cidade>>(this.url, { params }).pipe(
      tap((p) => (p.conteudo ?? []).forEach((c) => this.vistas.set(c.id, c))),
      map((p) => ({
        itens: (p.conteudo ?? []).map((c) => ({ valor: String(c.id), rotulo: `${c.nome} — ${c.uf}` })),
        ultima: p.ultima ?? true,
      })),
    );
  };

  /** `{nome, uf}` de uma cidade por id — do cache das páginas já vistas, ou busca no servidor. */
  resolver(id: number): Observable<Cidade | null> {
    const cache = this.vistas.get(id);
    if (cache) {
      return of(cache);
    }
    return this.http.get<Cidade>(`${this.url}/${id}`).pipe(
      tap((c) => this.vistas.set(c.id, c)),
      catchError(() => of(null)),
    );
  }
}
