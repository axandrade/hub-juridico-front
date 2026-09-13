import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../../environments/environment';

/** Item do catálogo "Perito" (`GET /api/v1/peritos`). `cpf` é `null` quando não informado. */
export interface Perito {
  id: number;
  nome: string;
  cpf: string | null;
}

/**
 * Catálogo "Perito" (Spring `/api/v1/peritos`) — mesmo desenho do `MagistradoService`, com um
 * campo a mais (`cpf`, opcional). Alimenta o dropdown "Perito" da seção "Perito Judicial"; o
 * processo guarda `perito_id` (chave estrangeira de verdade).
 */
@Injectable({ providedIn: 'root' })
export class PeritoService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/peritos`;

  private readonly _peritos = signal<Perito[]>([]);
  readonly peritos = this._peritos.asReadonly();

  private carregando = false;
  private carregado = false;

  /** Busca a lista uma única vez (idempotente); recarrega se a última tentativa falhou. */
  carregar(): void {
    if (this.carregado || this.carregando) {
      return;
    }
    this.carregando = true;
    this.http.get<Perito[]>(this.url).subscribe({
      next: (lista) => {
        this._peritos.set(this.ordenar(lista));
        this.carregado = true;
        this.carregando = false;
      },
      error: () => {
        this.carregando = false;
      },
    });
  }

  criar(nome: string, cpf: string | null): Observable<Perito> {
    return this.http
      .post<Perito>(this.url, { nome, cpf })
      .pipe(tap((item) => this._peritos.update((l) => this.ordenar([...l, item]))));
  }

  alterar(id: number, nome: string, cpf: string | null): Observable<Perito> {
    return this.http
      .put<Perito>(`${this.url}/${id}`, { nome, cpf })
      .pipe(
        tap((item) =>
          this._peritos.update((l) => this.ordenar(l.map((p) => (p.id === id ? item : p)))),
        ),
      );
  }

  excluir(id: number): Observable<void> {
    return this.http
      .delete<void>(`${this.url}/${id}`)
      .pipe(tap(() => this._peritos.update((l) => l.filter((p) => p.id !== id))));
  }

  private ordenar(lista: Perito[]): Perito[] {
    return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }
}
