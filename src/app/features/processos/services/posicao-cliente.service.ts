import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../../environments/environment';

/** Item do catálogo "Posição do cliente" (`GET /api/v1/posicao-cliente`). */
export interface PosicaoCliente {
  id: number;
  nome: string;
}

/**
 * Catálogo "Posição do cliente" (Spring `/api/v1/posicao-cliente`) — mesmo desenho do
 * `StatusProcessoService`. Alimenta o dropdown de posição do cliente principal; é só a lista de
 * opções — o processo guarda o texto escolhido, sem vínculo.
 */
@Injectable({ providedIn: 'root' })
export class PosicaoClienteService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/posicao-cliente`;

  private readonly _posicoes = signal<PosicaoCliente[]>([]);
  readonly posicoes = this._posicoes.asReadonly();

  private carregando = false;
  private carregado = false;

  /** Busca a lista uma única vez (idempotente); recarrega se a última tentativa falhou. */
  carregar(): void {
    if (this.carregado || this.carregando) {
      return;
    }
    this.carregando = true;
    this.http.get<PosicaoCliente[]>(this.url).subscribe({
      next: (lista) => {
        this._posicoes.set(lista);
        this.carregado = true;
        this.carregando = false;
      },
      error: () => {
        this.carregando = false;
      },
    });
  }

  criar(nome: string): Observable<PosicaoCliente> {
    return this.http
      .post<PosicaoCliente>(this.url, { nome })
      .pipe(tap((item) => this._posicoes.update((l) => this.ordenar([...l, item]))));
  }

  alterar(id: number, nome: string): Observable<PosicaoCliente> {
    return this.http
      .put<PosicaoCliente>(`${this.url}/${id}`, { nome })
      .pipe(
        tap((item) =>
          this._posicoes.update((l) => this.ordenar(l.map((p) => (p.id === id ? item : p)))),
        ),
      );
  }

  excluir(id: number): Observable<void> {
    return this.http
      .delete<void>(`${this.url}/${id}`)
      .pipe(tap(() => this._posicoes.update((l) => l.filter((p) => p.id !== id))));
  }

  private ordenar(lista: PosicaoCliente[]): PosicaoCliente[] {
    return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }
}
