import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../../environments/environment';

/** Item do catálogo "Objeto" do processo (`GET /api/v1/objeto-processo`). */
export interface ObjetoProcesso {
  id: number;
  nome: string;
}

/**
 * Catálogo "Objeto" do processo (Spring `/api/v1/objeto-processo`) — mesmo desenho do
 * `FaseProcessoService`. Alimenta o "Objeto principal" e os "Objetos secundários" da aba "Objeto";
 * é só a lista de opções — o processo guarda o texto escolhido, sem vínculo.
 */
@Injectable({ providedIn: 'root' })
export class ObjetoProcessoService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/objeto-processo`;

  private readonly _objetos = signal<ObjetoProcesso[]>([]);
  readonly objetos = this._objetos.asReadonly();

  private carregando = false;
  private carregado = false;

  /** Busca a lista uma única vez (idempotente); recarrega se a última tentativa falhou. */
  carregar(): void {
    if (this.carregado || this.carregando) {
      return;
    }
    this.carregando = true;
    this.http.get<ObjetoProcesso[]>(this.url).subscribe({
      next: (lista) => {
        this._objetos.set(lista);
        this.carregado = true;
        this.carregando = false;
      },
      error: () => {
        this.carregando = false;
      },
    });
  }

  criar(nome: string): Observable<ObjetoProcesso> {
    return this.http
      .post<ObjetoProcesso>(this.url, { nome })
      .pipe(tap((item) => this._objetos.update((l) => this.ordenar([...l, item]))));
  }

  alterar(id: number, nome: string): Observable<ObjetoProcesso> {
    return this.http
      .put<ObjetoProcesso>(`${this.url}/${id}`, { nome })
      .pipe(
        tap((item) =>
          this._objetos.update((l) => this.ordenar(l.map((o) => (o.id === id ? item : o)))),
        ),
      );
  }

  excluir(id: number): Observable<void> {
    return this.http
      .delete<void>(`${this.url}/${id}`)
      .pipe(tap(() => this._objetos.update((l) => l.filter((o) => o.id !== id))));
  }

  private ordenar(lista: ObjetoProcesso[]): ObjetoProcesso[] {
    return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }
}
