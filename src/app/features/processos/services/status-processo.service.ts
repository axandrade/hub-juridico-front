import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../../environments/environment';

/** Item do catálogo "Status do processo" (`GET /api/v1/status-processo`). */
export interface StatusProcesso {
  id: number;
  nome: string;
}

/**
 * Catálogo "Status do processo" (Spring `/api/v1/status-processo`) — mesmo desenho do
 * `TipoAnexoService`: `status` é um signal que os componentes leem; `carregar()` busca uma vez
 * e `criar` / `alterar` / `excluir` mantêm o signal em dia (ordem alfabética, como no backend).
 * É só a lista de opções do dropdown — o processo guarda o texto escolhido em `processos.status`,
 * sem vínculo; renomear/excluir aqui não mexe nos processos já salvos.
 */
@Injectable({ providedIn: 'root' })
export class StatusProcessoService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/status-processo`;

  private readonly _status = signal<StatusProcesso[]>([]);
  readonly status = this._status.asReadonly();

  private carregando = false;
  private carregado = false;

  /** Busca a lista uma única vez (idempotente); recarrega se a última tentativa falhou. */
  carregar(): void {
    if (this.carregado || this.carregando) {
      return;
    }
    this.carregando = true;
    this.http.get<StatusProcesso[]>(this.url).subscribe({
      next: (lista) => {
        this._status.set(lista);
        this.carregado = true;
        this.carregando = false;
      },
      error: () => {
        this.carregando = false;
      },
    });
  }

  criar(nome: string): Observable<StatusProcesso> {
    return this.http
      .post<StatusProcesso>(this.url, { nome })
      .pipe(tap((item) => this._status.update((l) => this.ordenar([...l, item]))));
  }

  alterar(id: number, nome: string): Observable<StatusProcesso> {
    return this.http
      .put<StatusProcesso>(`${this.url}/${id}`, { nome })
      .pipe(
        tap((item) =>
          this._status.update((l) => this.ordenar(l.map((s) => (s.id === id ? item : s)))),
        ),
      );
  }

  excluir(id: number): Observable<void> {
    return this.http
      .delete<void>(`${this.url}/${id}`)
      .pipe(tap(() => this._status.update((l) => l.filter((s) => s.id !== id))));
  }

  private ordenar(lista: StatusProcesso[]): StatusProcesso[] {
    return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }
}
