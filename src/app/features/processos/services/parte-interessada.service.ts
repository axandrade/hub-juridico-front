import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../../environments/environment';

/** Item do catálogo "Parte interessada" da testemunha (`GET /api/v1/parte-interessada`). */
export interface ParteInteressada {
  id: number;
  nome: string;
}

/**
 * Catálogo "Parte interessada" da testemunha (Spring `/api/v1/parte-interessada`) — mesmo desenho
 * do `FaseProcessoService`. Alimenta o dropdown "Parte interessada" da seção "Testemunhas"; é só a
 * lista de opções — o processo guarda o texto escolhido em cada linha, sem vínculo.
 */
@Injectable({ providedIn: 'root' })
export class ParteInteressadaService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/parte-interessada`;

  private readonly _partes = signal<ParteInteressada[]>([]);
  readonly partes = this._partes.asReadonly();

  private carregando = false;
  private carregado = false;

  /** Busca a lista uma única vez (idempotente); recarrega se a última tentativa falhou. */
  carregar(): void {
    if (this.carregado || this.carregando) {
      return;
    }
    this.carregando = true;
    this.http.get<ParteInteressada[]>(this.url).subscribe({
      next: (lista) => {
        this._partes.set(lista);
        this.carregado = true;
        this.carregando = false;
      },
      error: () => {
        this.carregando = false;
      },
    });
  }

  criar(nome: string): Observable<ParteInteressada> {
    return this.http
      .post<ParteInteressada>(this.url, { nome })
      .pipe(tap((item) => this._partes.update((l) => this.ordenar([...l, item]))));
  }

  alterar(id: number, nome: string): Observable<ParteInteressada> {
    return this.http
      .put<ParteInteressada>(`${this.url}/${id}`, { nome })
      .pipe(
        tap((item) =>
          this._partes.update((l) => this.ordenar(l.map((p) => (p.id === id ? item : p)))),
        ),
      );
  }

  excluir(id: number): Observable<void> {
    return this.http
      .delete<void>(`${this.url}/${id}`)
      .pipe(tap(() => this._partes.update((l) => l.filter((p) => p.id !== id))));
  }

  private ordenar(lista: ParteInteressada[]): ParteInteressada[] {
    return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }
}
