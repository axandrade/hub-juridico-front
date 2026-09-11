import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../../environments/environment';

/**
 * Item do catálogo "Órgão" julgador (`GET /api/v1/orgao-julgador`). `nome` vem pronto como
 * "TRIBUNAL - descrição" (o back reconstrói); `tribunal_id` identifica o tribunal por trás, pra
 * filtrar a lista quando um tribunal é escolhido (aba "Dados gerais" → "Órgãos processantes").
 */
export interface OrgaoJulgador {
  id: number;
  nome: string;
  tribunal_id: number;
}

/**
 * Catálogo "Órgão" julgador (Spring `/api/v1/orgao-julgador`) — mesmo desenho do
 * `FaseProcessoService`. Alimenta o dropdown "Órgão" da seção "Magistrados"; é só a lista de
 * opções — o processo guarda o texto escolhido em cada linha, sem vínculo. Não confundir com a
 * lista "Órgãos processantes" (texto livre) da aba "Dados gerais".
 */
@Injectable({ providedIn: 'root' })
export class OrgaoJulgadorService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/orgao-julgador`;

  private readonly _orgaos = signal<OrgaoJulgador[]>([]);
  readonly orgaos = this._orgaos.asReadonly();

  private carregando = false;
  private carregado = false;

  /** Busca a lista uma única vez (idempotente); recarrega se a última tentativa falhou. */
  carregar(): void {
    if (this.carregado || this.carregando) {
      return;
    }
    this.buscar();
  }

  /**
   * Força um novo fetch, ignorando o cache — usado depois de renomear um `Tribunal`, já que
   * `nome` aqui embute o código dele ("TRIBUNAL - descrição") e ficaria desatualizado.
   */
  recarregar(): void {
    this.carregado = false;
    this.buscar();
  }

  private buscar(): void {
    this.carregando = true;
    this.http.get<OrgaoJulgador[]>(this.url).subscribe({
      next: (lista) => {
        // ordena no cliente com collation numérica (TRT-2 antes de TRT-10) — o back só faz ORDER BY nome.
        this._orgaos.set(this.ordenar(lista));
        this.carregado = true;
        this.carregando = false;
      },
      error: () => {
        this.carregando = false;
      },
    });
  }

  /** `nome` no formato "TRIBUNAL - descrição" (ex.: "TRT-7 - Tribunal Regional do Trabalho da 7ª Região"). */
  criar(nome: string): Observable<OrgaoJulgador> {
    return this.http
      .post<OrgaoJulgador>(this.url, { nome })
      .pipe(tap((item) => this._orgaos.update((l) => this.ordenar([...l, item]))));
  }

  alterar(id: number, nome: string): Observable<OrgaoJulgador> {
    return this.http
      .put<OrgaoJulgador>(`${this.url}/${id}`, { nome })
      .pipe(
        tap((item) =>
          this._orgaos.update((l) => this.ordenar(l.map((o) => (o.id === id ? item : o)))),
        ),
      );
  }

  excluir(id: number): Observable<void> {
    return this.http
      .delete<void>(`${this.url}/${id}`)
      .pipe(tap(() => this._orgaos.update((l) => l.filter((o) => o.id !== id))));
  }

  private ordenar(lista: OrgaoJulgador[]): OrgaoJulgador[] {
    return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }));
  }
}
