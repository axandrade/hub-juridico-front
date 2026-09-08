import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../../environments/environment';

/** Item do catálogo "Natureza" do processo (`GET /api/v1/natureza-processo`). */
export interface NaturezaProcesso {
  id: number;
  nome: string;
}

/**
 * Catálogo "Natureza" do processo (Spring `/api/v1/natureza-processo`) — mesmo desenho do
 * `AcaoProcessoService` / `PosicaoClienteService`. Alimenta o dropdown de Natureza; é só a lista
 * de opções — o processo guarda o texto escolhido (`processos.natureza`), sem vínculo.
 */
@Injectable({ providedIn: 'root' })
export class NaturezaProcessoService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/natureza-processo`;

  private readonly _naturezas = signal<NaturezaProcesso[]>([]);
  readonly naturezas = this._naturezas.asReadonly();

  private carregando = false;
  private carregado = false;

  /** Busca a lista uma única vez (idempotente); recarrega se a última tentativa falhou. */
  carregar(): void {
    if (this.carregado || this.carregando) {
      return;
    }
    this.carregando = true;
    this.http.get<NaturezaProcesso[]>(this.url).subscribe({
      next: (lista) => {
        this._naturezas.set(lista);
        this.carregado = true;
        this.carregando = false;
      },
      error: () => {
        this.carregando = false;
      },
    });
  }

  criar(nome: string): Observable<NaturezaProcesso> {
    return this.http
      .post<NaturezaProcesso>(this.url, { nome })
      .pipe(tap((item) => this._naturezas.update((l) => this.ordenar([...l, item]))));
  }

  alterar(id: number, nome: string): Observable<NaturezaProcesso> {
    return this.http
      .put<NaturezaProcesso>(`${this.url}/${id}`, { nome })
      .pipe(
        tap((item) =>
          this._naturezas.update((l) => this.ordenar(l.map((n) => (n.id === id ? item : n)))),
        ),
      );
  }

  excluir(id: number): Observable<void> {
    return this.http
      .delete<void>(`${this.url}/${id}`)
      .pipe(tap(() => this._naturezas.update((l) => l.filter((n) => n.id !== id))));
  }

  private ordenar(lista: NaturezaProcesso[]): NaturezaProcesso[] {
    return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }
}
