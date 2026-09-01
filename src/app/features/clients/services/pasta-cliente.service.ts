import { Injectable, computed, signal } from '@angular/core';

/** Cliente cuja "pasta" (lista de arquivos) pode ser aberta. */
export interface ClientePasta {
  id: number;
  nome: string;
}

/**
 * Ponte entre o header ("Abrir pasta do cliente") e a tela de clientes: guarda qual
 * cliente está selecionado e se o diálogo da pasta está aberto. A tela de clientes
 * publica o cliente selecionado; o header dispara `abrir()`.
 */
@Injectable({ providedIn: 'root' })
export class PastaClienteService {
  private readonly _cliente = signal<ClientePasta | null>(null);
  private readonly _aberto = signal(false);

  readonly cliente = this._cliente.asReadonly();
  readonly aberto = this._aberto.asReadonly();
  readonly temCliente = computed(() => this._cliente() !== null);

  /** Chamado pela tela de clientes quando a seleção muda. */
  definirCliente(cliente: ClientePasta | null): void {
    this._cliente.set(cliente);
    if (!cliente) {
      this._aberto.set(false);
    }
  }

  abrir(): void {
    if (this._cliente()) {
      this._aberto.set(true);
    }
  }

  fechar(): void {
    this._aberto.set(false);
  }
}
