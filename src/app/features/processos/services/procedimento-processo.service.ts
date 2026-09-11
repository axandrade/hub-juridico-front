import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../../environments/environment';

/** Item do catálogo "Procedimento" do processo (`GET /api/v1/procedimento-processo`). */
export interface ProcedimentoProcesso {
  id: number;
  nome: string;
}

/**
 * Catálogo "Procedimento" do processo (Spring `/api/v1/procedimento-processo`) — mesmo desenho do
 * `FaseProcessoService` / `NaturezaProcessoService` / `AcaoProcessoService`. Alimenta o dropdown de
 * Procedimento; é só a lista de opções — o processo guarda o texto escolhido
 * (`processos.procedimento`), sem vínculo.
 */
@Injectable({ providedIn: 'root' })
export class ProcedimentoProcessoService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/procedimento-processo`;

  private readonly _procedimentos = signal<ProcedimentoProcesso[]>([]);
  readonly procedimentos = this._procedimentos.asReadonly();

  private carregando = false;
  private carregado = false;

  /** Busca a lista uma única vez (idempotente); recarrega se a última tentativa falhou. */
  carregar(): void {
    if (this.carregado || this.carregando) {
      return;
    }
    this.carregando = true;
    this.http.get<ProcedimentoProcesso[]>(this.url).subscribe({
      next: (lista) => {
        this._procedimentos.set(lista);
        this.carregado = true;
        this.carregando = false;
      },
      error: () => {
        this.carregando = false;
      },
    });
  }

  criar(nome: string): Observable<ProcedimentoProcesso> {
    return this.http
      .post<ProcedimentoProcesso>(this.url, { nome })
      .pipe(tap((item) => this._procedimentos.update((l) => this.ordenar([...l, item]))));
  }

  alterar(id: number, nome: string): Observable<ProcedimentoProcesso> {
    return this.http
      .put<ProcedimentoProcesso>(`${this.url}/${id}`, { nome })
      .pipe(
        tap((item) =>
          this._procedimentos.update((l) => this.ordenar(l.map((p) => (p.id === id ? item : p)))),
        ),
      );
  }

  excluir(id: number): Observable<void> {
    return this.http
      .delete<void>(`${this.url}/${id}`)
      .pipe(tap(() => this._procedimentos.update((l) => l.filter((p) => p.id !== id))));
  }

  private ordenar(lista: ProcedimentoProcesso[]): ProcedimentoProcesso[] {
    return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }
}
