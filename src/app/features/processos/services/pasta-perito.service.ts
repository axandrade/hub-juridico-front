import { Injectable, signal } from '@angular/core';

/** Perito cuja "pasta" (lista de arquivos) pode ser aberta. */
export interface PeritoPasta {
  id: number;
  nome: string;
}

/**
 * Ponte entre o botão na linha do perito (aba "Outros envolvidos") e o diálogo de arquivos
 * dele — cópia fiel de `PastaMagistradoService` (mesmo comportamento): aqui não existe "visão
 * geral" (o botão sempre já sabe qual perito), então não há estado de "nenhum selecionado" —
 * `abrir` já recebe quem abrir.
 */
@Injectable({ providedIn: 'root' })
export class PastaPeritoService {
  private readonly _perito = signal<PeritoPasta | null>(null);
  private readonly _aberto = signal(false);

  readonly perito = this._perito.asReadonly();
  readonly aberto = this._aberto.asReadonly();

  abrir(perito: PeritoPasta): void {
    this._perito.set(perito);
    this._aberto.set(true);
  }

  fechar(): void {
    this._aberto.set(false);
  }
}
