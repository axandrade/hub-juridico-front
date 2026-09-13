import { Injectable, signal } from '@angular/core';

/** Magistrado cuja "pasta" (lista de arquivos) pode ser aberta. */
export interface MagistradoPasta {
  id: number;
  nome: string;
}

/**
 * Ponte entre o botão na linha do magistrado (aba "Outros envolvidos") e o diálogo de arquivos
 * dele — versão simplificada de `PastaClienteService`: aqui não existe "visão geral" (o botão
 * sempre já sabe qual magistrado), então não há estado de "nenhum selecionado" — `abrir` já
 * recebe quem abrir.
 */
@Injectable({ providedIn: 'root' })
export class PastaMagistradoService {
  private readonly _magistrado = signal<MagistradoPasta | null>(null);
  private readonly _aberto = signal(false);

  readonly magistrado = this._magistrado.asReadonly();
  readonly aberto = this._aberto.asReadonly();

  abrir(magistrado: MagistradoPasta): void {
    this._magistrado.set(magistrado);
    this._aberto.set(true);
  }

  fechar(): void {
    this._aberto.set(false);
  }
}
