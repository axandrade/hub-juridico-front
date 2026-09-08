import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../../environments/environment';

/** Item do catálogo "Fase" do processo (`GET /api/v1/fase-processo`). */
export interface FaseProcesso {
  id: number;
  nome: string;
}

/**
 * Catálogo "Fase" do processo (Spring `/api/v1/fase-processo`) — mesmo desenho do
 * `NaturezaProcessoService` / `AcaoProcessoService`. Alimenta o dropdown de Fase; é só a lista de
 * opções — o processo guarda o texto escolhido (`processos.fase`), sem vínculo.
 */
@Injectable({ providedIn: 'root' })
export class FaseProcessoService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/fase-processo`;

  private readonly _fases = signal<FaseProcesso[]>([]);
  readonly fases = this._fases.asReadonly();

  private carregando = false;
  private carregado = false;

  /** Busca a lista uma única vez (idempotente); recarrega se a última tentativa falhou. */
  carregar(): void {
    if (this.carregado || this.carregando) {
      return;
    }
    this.carregando = true;
    this.http.get<FaseProcesso[]>(this.url).subscribe({
      next: (lista) => {
        this._fases.set(lista);
        this.carregado = true;
        this.carregando = false;
      },
      error: () => {
        this.carregando = false;
      },
    });
  }

  criar(nome: string): Observable<FaseProcesso> {
    return this.http
      .post<FaseProcesso>(this.url, { nome })
      .pipe(tap((item) => this._fases.update((l) => this.ordenar([...l, item]))));
  }

  alterar(id: number, nome: string): Observable<FaseProcesso> {
    return this.http
      .put<FaseProcesso>(`${this.url}/${id}`, { nome })
      .pipe(
        tap((item) =>
          this._fases.update((l) => this.ordenar(l.map((f) => (f.id === id ? item : f)))),
        ),
      );
  }

  excluir(id: number): Observable<void> {
    return this.http
      .delete<void>(`${this.url}/${id}`)
      .pipe(tap(() => this._fases.update((l) => l.filter((f) => f.id !== id))));
  }

  private ordenar(lista: FaseProcesso[]): FaseProcesso[] {
    return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }
}
