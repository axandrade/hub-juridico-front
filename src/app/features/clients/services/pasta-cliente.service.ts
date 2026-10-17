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
 *
 * O diálogo abre sempre: com um cliente selecionado ele mostra o explorador daquele
 * cliente; sem nenhum, mostra a tabela de visão geral (todos os clientes, com ou sem arquivo ainda).
 *
 * `abrir(cliente)` abre direto na pasta de um cliente específico (ex.: botão por linha em
 * "Clientes" da ficha do processo) sem mexer na seleção — ao fechar, o botão do header volta a
 * abrir o cliente selecionado.
 */
@Injectable({ providedIn: 'root' })
export class PastaClienteService {
  private readonly _cliente = signal<ClientePasta | null>(null);
  private readonly _aberto = signal(false);
  /** Cliente pedido explicitamente em `abrir(cliente)`; vale só enquanto o diálogo está aberto. */
  private readonly _avulso = signal<ClientePasta | null>(null);

  readonly cliente = this._cliente.asReadonly();
  readonly aberto = this._aberto.asReadonly();
  readonly avulso = this._avulso.asReadonly();
  readonly temCliente = computed(() => this._cliente() !== null);

  /** Chamado pela tela de clientes quando a seleção muda. */
  definirCliente(cliente: ClientePasta | null): void {
    this._cliente.set(cliente);
    if (!cliente) {
      this.fechar();
    }
  }

  /** Sem argumento abre no cliente selecionado (ou na visão geral); com um cliente, abre nele. */
  abrir(cliente?: ClientePasta): void {
    this._avulso.set(cliente ?? null);
    this._aberto.set(true);
  }

  fechar(): void {
    this._aberto.set(false);
    this._avulso.set(null);
  }
}
