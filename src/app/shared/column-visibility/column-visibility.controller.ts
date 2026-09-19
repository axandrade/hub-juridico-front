import { WritableSignal, signal } from '@angular/core';

import { TableColumn } from '../components/table/table-column.model';

export interface ColumnVisibilityOptions<T extends object> {
  /** Colunas atuais da tabela — lido a cada verificação, nunca cacheado (a lista pode mudar). */
  columns: () => readonly TableColumn<T>[];
  /** Colunas visíveis por padrão (por `key`); ausente/`null` = todas. */
  defaultVisibleColumns?: () => readonly string[] | null;
  /** Chave de `localStorage` pra lembrar a escolha entre sessões; ausente/`null` = não persiste. */
  storageKey?: () => string | null;
}

/**
 * Estado + persistência do menu "Colunas" (mostrar/ocultar colunas de uma tabela) — extraído de
 * `DataTableComponent`/`DomainModelTableComponent`, que tinham cada um a própria cópia dessa
 * lógica (e cada tela dona, por sua vez, sua própria cópia do botão/menu — ver
 * `ColumnsMenuComponent`). Mesmo espírito do `PanelShellController`: uma classe simples (não um
 * serviço Angular), instanciada uma vez por tabela, com o `document` injetado pelo dono pra
 * persistir em `localStorage` com segurança (SSR/storage indisponível).
 *
 * Carrega o valor salvo sob demanda via `carregarStorage()` — o dono chama isso num `effect` do
 * próprio construtor (nunca direto: os inputs do dono, como `columns`/`storageKey`, só têm o valor
 * de verdade depois que o Angular aplica as bindings, o que acontece depois do construtor rodar —
 * um `effect` resolve isso). `isVisible`/`currentKeys` são só leitura de propósito: são chamados de
 * dentro do `computed` que filtra as colunas visíveis, e escrever num signal ali dispara `NG0600`
 * ("Writing to signals is not allowed in a computed") — por isso o carregamento não pode acontecer
 * de forma preguiçosa ali dentro.
 */
export class ColumnVisibilityController<T extends object> {
  readonly menuOpen: WritableSignal<boolean> = signal(false);
  private readonly visibleKeysOverride: WritableSignal<Set<string> | null> = signal(null);
  private carregouStorage = false;

  constructor(
    private readonly document: Document,
    private readonly opts: ColumnVisibilityOptions<T>,
  ) {}

  readonly isVisible = (key: string): boolean => this.currentKeys().has(key);

  readonly toggle = (key: string): void => {
    const next = new Set(this.currentKeys());
    if (next.has(key)) {
      if (next.size > 1) {
        next.delete(key);
      }
    } else {
      next.add(key);
    }
    this.visibleKeysOverride.set(next);
    this.persistir(next);
  };

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  /** Chame isso num `effect` do construtor do dono — nunca de dentro de um `computed`. */
  carregarStorage(): void {
    if (this.carregouStorage) {
      return;
    }
    const chave = this.opts.storageKey?.() ?? null;
    if (!chave) {
      return;
    }
    this.carregouStorage = true;
    const salvo = this.lerStorage(chave);
    if (!salvo) {
      return;
    }
    const validas = new Set([...salvo].filter((key) => this.opts.columns().some((column) => column.key === key)));
    if (validas.size > 0) {
      this.visibleKeysOverride.set(validas);
    }
  }

  private currentKeys(): Set<string> {
    return this.visibleKeysOverride() ?? this.defaultKeys();
  }

  private defaultKeys(): Set<string> {
    const defaults = this.opts.defaultVisibleColumns?.() ?? null;
    return defaults ? new Set(defaults) : new Set(this.opts.columns().map((column) => column.key));
  }

  private lerStorage(chave: string): Set<string> | null {
    try {
      const salvo = this.document.defaultView?.localStorage.getItem(chave);
      if (!salvo) {
        return null;
      }
      const lista = JSON.parse(salvo);
      return Array.isArray(lista) && lista.every((item) => typeof item === 'string') ? new Set(lista) : null;
    } catch {
      return null;
    }
  }

  private persistir(colunas: Set<string>): void {
    const chave = this.opts.storageKey?.() ?? null;
    if (!chave) {
      return;
    }
    try {
      this.document.defaultView?.localStorage.setItem(chave, JSON.stringify([...colunas]));
    } catch {
      /* storage indisponível — a escolha vale só nesta sessão */
    }
  }
}
