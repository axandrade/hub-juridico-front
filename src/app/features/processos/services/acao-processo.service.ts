import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../../environments/environment';

/** Item do catálogo "Ação" do processo (`GET /api/v1/acao-processo`). */
export interface AcaoProcesso {
  id: number;
  nome: string;
}

/**
 * Catálogo "Ação" do processo (Spring `/api/v1/acao-processo`) — mesmo desenho do
 * `PosicaoClienteService` / `StatusProcessoService`. Alimenta o dropdown de Ação; é só a lista de
 * opções — o processo guarda o texto escolhido (`processos.acao`), sem vínculo.
 */
@Injectable({ providedIn: 'root' })
export class AcaoProcessoService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/acao-processo`;

  private readonly _acoes = signal<AcaoProcesso[]>([]);
  readonly acoes = this._acoes.asReadonly();

  private carregando = false;
  private carregado = false;

  /** Busca a lista uma única vez (idempotente); recarrega se a última tentativa falhou. */
  carregar(): void {
    if (this.carregado || this.carregando) {
      return;
    }
    this.carregando = true;
    this.http.get<AcaoProcesso[]>(this.url).subscribe({
      next: (lista) => {
        this._acoes.set(lista);
        this.carregado = true;
        this.carregando = false;
      },
      error: () => {
        this.carregando = false;
      },
    });
  }

  criar(nome: string): Observable<AcaoProcesso> {
    return this.http
      .post<AcaoProcesso>(this.url, { nome })
      .pipe(tap((item) => this._acoes.update((l) => this.ordenar([...l, item]))));
  }

  alterar(id: number, nome: string): Observable<AcaoProcesso> {
    return this.http
      .put<AcaoProcesso>(`${this.url}/${id}`, { nome })
      .pipe(
        tap((item) =>
          this._acoes.update((l) => this.ordenar(l.map((a) => (a.id === id ? item : a)))),
        ),
      );
  }

  excluir(id: number): Observable<void> {
    return this.http
      .delete<void>(`${this.url}/${id}`)
      .pipe(tap(() => this._acoes.update((l) => l.filter((a) => a.id !== id))));
  }

  private ordenar(lista: AcaoProcesso[]): AcaoProcesso[] {
    return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }
}
