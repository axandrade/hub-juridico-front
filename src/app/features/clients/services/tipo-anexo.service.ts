import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../../environments/environment';

/** Item do catálogo "Tipo do anexo" (`GET /api/v1/tipos-anexo`). */
export interface TipoAnexo {
  id: number;
  nome: string;
}

/**
 * Catálogo "Tipo do anexo" (Spring `/api/v1/tipos-anexo`). Fonte única da lista para a
 * feature: `tipos` é um signal que os componentes leem; `carregar()` busca uma vez e
 * `criar` / `alterar` / `excluir` mantêm o signal em dia (ordem alfabética, como no backend).
 */
@Injectable({ providedIn: 'root' })
export class TipoAnexoService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/tipos-anexo`;

  private readonly _tipos = signal<TipoAnexo[]>([]);
  readonly tipos = this._tipos.asReadonly();

  private carregando = false;
  private carregado = false;

  /** Busca a lista uma única vez (idempotente); recarrega se a última tentativa falhou. */
  carregar(): void {
    if (this.carregado || this.carregando) {
      return;
    }
    this.carregando = true;
    this.http.get<TipoAnexo[]>(this.url).subscribe({
      next: (lista) => {
        this._tipos.set(lista);
        this.carregado = true;
        this.carregando = false;
      },
      error: () => {
        this.carregando = false;
      },
    });
  }

  criar(nome: string): Observable<TipoAnexo> {
    return this.http
      .post<TipoAnexo>(this.url, { nome })
      .pipe(tap((tipo) => this._tipos.update((l) => this.ordenar([...l, tipo]))));
  }

  alterar(id: number, nome: string): Observable<TipoAnexo> {
    return this.http
      .put<TipoAnexo>(`${this.url}/${id}`, { nome })
      .pipe(
        tap((tipo) =>
          this._tipos.update((l) => this.ordenar(l.map((t) => (t.id === id ? tipo : t)))),
        ),
      );
  }

  excluir(id: number): Observable<void> {
    return this.http
      .delete<void>(`${this.url}/${id}`)
      .pipe(tap(() => this._tipos.update((l) => l.filter((t) => t.id !== id))));
  }

  private ordenar(lista: TipoAnexo[]): TipoAnexo[] {
    return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }
}
