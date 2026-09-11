import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../../environments/environment';

/** Item do catálogo "Tribunal" (`GET /api/v1/tribunais`) — STF, STJ, TRF-2, TRT-24 etc. */
export interface Tribunal {
  id: number;
  nome: string;
}

/**
 * Catálogo "Tribunal" (Spring `/api/v1/tribunais`) — mesmo desenho do `OrgaoJulgadorService`.
 * Alimenta o primeiro passo da cascata "Órgãos processantes" (aba "Dados gerais"): escolhe o
 * tribunal, depois o `OrgaoJulgadorService` filtra os órgãos por `tribunal_id`.
 */
@Injectable({ providedIn: 'root' })
export class TribunalService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/tribunais`;

  private readonly _tribunais = signal<Tribunal[]>([]);
  readonly tribunais = this._tribunais.asReadonly();

  private carregando = false;
  private carregado = false;

  /** Busca a lista uma única vez (idempotente); recarrega se a última tentativa falhou. */
  carregar(): void {
    if (this.carregado || this.carregando) {
      return;
    }
    this.carregando = true;
    this.http.get<Tribunal[]>(this.url).subscribe({
      next: (lista) => {
        this._tribunais.set(this.ordenar(lista));
        this.carregado = true;
        this.carregando = false;
      },
      error: () => {
        this.carregando = false;
      },
    });
  }

  criar(nome: string): Observable<Tribunal> {
    return this.http
      .post<Tribunal>(this.url, { nome })
      .pipe(tap((item) => this._tribunais.update((l) => this.ordenar([...l, item]))));
  }

  alterar(id: number, nome: string): Observable<Tribunal> {
    return this.http
      .put<Tribunal>(`${this.url}/${id}`, { nome })
      .pipe(
        tap((item) =>
          this._tribunais.update((l) => this.ordenar(l.map((t) => (t.id === id ? item : t)))),
        ),
      );
  }

  excluir(id: number): Observable<void> {
    return this.http
      .delete<void>(`${this.url}/${id}`)
      .pipe(tap(() => this._tribunais.update((l) => l.filter((t) => t.id !== id))));
  }

  private ordenar(lista: Tribunal[]): Tribunal[] {
    return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }));
  }
}
