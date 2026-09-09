import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../../environments/environment';

/** Item do catálogo "Resultado" da decisão (`GET /api/v1/resultado-decisao`). */
export interface ResultadoDecisao {
  id: number;
  nome: string;
}

/**
 * Catálogo "Resultado" da decisão (Spring `/api/v1/resultado-decisao`) — mesmo desenho do
 * `FaseProcessoService`. Alimenta o dropdown "Resultado" da seção "Magistrados"; é só a lista de
 * opções — o processo guarda o texto escolhido em cada linha, sem vínculo.
 */
@Injectable({ providedIn: 'root' })
export class ResultadoDecisaoService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/resultado-decisao`;

  private readonly _resultados = signal<ResultadoDecisao[]>([]);
  readonly resultados = this._resultados.asReadonly();

  private carregando = false;
  private carregado = false;

  /** Busca a lista uma única vez (idempotente); recarrega se a última tentativa falhou. */
  carregar(): void {
    if (this.carregado || this.carregando) {
      return;
    }
    this.carregando = true;
    this.http.get<ResultadoDecisao[]>(this.url).subscribe({
      next: (lista) => {
        this._resultados.set(lista);
        this.carregado = true;
        this.carregando = false;
      },
      error: () => {
        this.carregando = false;
      },
    });
  }

  criar(nome: string): Observable<ResultadoDecisao> {
    return this.http
      .post<ResultadoDecisao>(this.url, { nome })
      .pipe(tap((item) => this._resultados.update((l) => this.ordenar([...l, item]))));
  }

  alterar(id: number, nome: string): Observable<ResultadoDecisao> {
    return this.http
      .put<ResultadoDecisao>(`${this.url}/${id}`, { nome })
      .pipe(
        tap((item) =>
          this._resultados.update((l) => this.ordenar(l.map((r) => (r.id === id ? item : r)))),
        ),
      );
  }

  excluir(id: number): Observable<void> {
    return this.http
      .delete<void>(`${this.url}/${id}`)
      .pipe(tap(() => this._resultados.update((l) => l.filter((r) => r.id !== id))));
  }

  private ordenar(lista: ResultadoDecisao[]): ResultadoDecisao[] {
    return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }
}
