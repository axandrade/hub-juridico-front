import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../../environments/environment';

/** Item do catálogo "Magistrado" (`GET /api/v1/magistrados`). */
export interface Magistrado {
  id: number;
  nome: string;
}

/**
 * Catálogo "Magistrado" (Spring `/api/v1/magistrados`) — mesmo desenho do `ParteInteressadaService`.
 * Alimenta o dropdown "Magistrado" da seção "Magistrados"; é só a lista de opções — o processo
 * guarda o texto escolhido em cada linha, sem vínculo.
 */
@Injectable({ providedIn: 'root' })
export class MagistradoService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/magistrados`;

  private readonly _magistrados = signal<Magistrado[]>([]);
  readonly magistrados = this._magistrados.asReadonly();

  private carregando = false;
  private carregado = false;

  /** Busca a lista uma única vez (idempotente); recarrega se a última tentativa falhou. */
  carregar(): void {
    if (this.carregado || this.carregando) {
      return;
    }
    this.carregando = true;
    this.http.get<Magistrado[]>(this.url).subscribe({
      next: (lista) => {
        this._magistrados.set(this.ordenar(lista));
        this.carregado = true;
        this.carregando = false;
      },
      error: () => {
        this.carregando = false;
      },
    });
  }

  criar(nome: string): Observable<Magistrado> {
    return this.http
      .post<Magistrado>(this.url, { nome })
      .pipe(tap((item) => this._magistrados.update((l) => this.ordenar([...l, item]))));
  }

  alterar(id: number, nome: string): Observable<Magistrado> {
    return this.http
      .put<Magistrado>(`${this.url}/${id}`, { nome })
      .pipe(
        tap((item) =>
          this._magistrados.update((l) => this.ordenar(l.map((m) => (m.id === id ? item : m)))),
        ),
      );
  }

  excluir(id: number): Observable<void> {
    return this.http
      .delete<void>(`${this.url}/${id}`)
      .pipe(tap(() => this._magistrados.update((l) => l.filter((m) => m.id !== id))));
  }

  private ordenar(lista: Magistrado[]): Magistrado[] {
    return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }
}
