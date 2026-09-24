import { WritableSignal, signal } from '@angular/core';

import { TableColumn } from '../components/table/table-column.model';

export interface ColumnVisibilityOptions<T extends object> {
  /** Colunas atuais da tabela — lido a cada verificação, nunca cacheado (a lista pode mudar). */
  columns: () => readonly TableColumn<T>[];
  /** Colunas visíveis por padrão (por `key`); ausente/`null` = todas. */
  defaultVisibleColumns?: () => readonly string[] | null;
  /** Chave de `localStorage` pra lembrar a escolha entre sessões; ausente/`null` = não persiste. A
   *  ordem (ver `orderedColumns`/`reorder`) usa a mesma chave com um sufixo (`.ordem`). */
  storageKey?: () => string | null;
}

/**
 * Estado + persistência do menu "Colunas" (mostrar/ocultar e reordenar colunas de uma tabela) —
 * extraído de `DataTableComponent`/`DomainModelTableComponent`, que tinham cada um a própria
 * cópia dessa lógica (e cada tela dona, por sua vez, sua própria cópia do botão/menu — ver
 * `ColumnsMenuComponent`). Mesmo espírito do `PanelShellController`: uma classe simples (não um
 * serviço Angular), instanciada uma vez por tabela, com o `document` injetado pelo dono pra
 * persistir em `localStorage` com segurança (SSR/storage indisponível).
 *
 * Carrega o valor salvo sob demanda via `carregarStorage()`/`carregarOrdemStorage()` — o dono
 * chama isso num `effect` do próprio construtor (nunca direto: os inputs do dono, como
 * `columns`/`storageKey`, só têm o valor de verdade depois que o Angular aplica as bindings, o
 * que acontece depois do construtor rodar — um `effect` resolve isso). `isVisible`/`currentKeys`/
 * `orderedColumns` são só leitura de propósito: são chamados de dentro do `computed` que resolve
 * `visibleColumns`, e escrever num signal ali dispara `NG0600` ("Writing to signals is not
 * allowed in a computed") — por isso o carregamento não pode acontecer de forma preguiçosa ali
 * dentro.
 */
export class ColumnVisibilityController<T extends object> {
  readonly menuOpen: WritableSignal<boolean> = signal(false);
  private readonly visibleKeysOverride: WritableSignal<Set<string> | null> = signal(null);
  private readonly columnOrder: WritableSignal<string[] | null> = signal(null);
  private carregouStorage = false;
  private carregouOrdem = false;

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
    this.persistirLista(this.opts.storageKey?.() ?? null, [...next]);
  };

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  /**
   * Marca/desmarca todas de uma vez (checkbox mestre do `ColumnsMenuComponent`). `desmarcar`
   * nunca zera de verdade — sempre sobra a primeira coluna (mesma regra do `toggle`, que nunca
   * deixa a última visível ser ocultada): uma tabela sem nenhuma coluna não faz sentido.
   */
  readonly toggleAll = (marcarTodas: boolean): void => {
    const colunas = this.opts.columns();
    const next = marcarTodas
      ? new Set(colunas.map((column) => column.key))
      : new Set(colunas.length > 0 ? [colunas[0].key] : []);
    this.visibleKeysOverride.set(next);
    this.persistirLista(this.opts.storageKey?.() ?? null, [...next]);
  };

  /** `columns()` na ordem escolhida pelo usuário — colunas novas (fora da ordem salva) entram no fim, na ordem original. */
  readonly orderedColumns = (): readonly TableColumn<T>[] => {
    const colunas = this.opts.columns();
    const ordem = this.columnOrder();
    if (!ordem) {
      return colunas;
    }
    const porChave = new Map(colunas.map((column) => [column.key, column]));
    const ordenadas: TableColumn<T>[] = [];
    for (const key of ordem) {
      const coluna = porChave.get(key);
      if (coluna) {
        ordenadas.push(coluna);
        porChave.delete(key);
      }
    }
    ordenadas.push(...colunas.filter((column) => porChave.has(column.key)));
    return ordenadas;
  };

  /**
   * Reordena arrastando o cabeçalho — `previousIndex`/`currentIndex` são posições dentro da
   * lista de colunas VISÍVEIS (ex.: vindos direto do `CdkDragDrop` do cabeçalho renderizado).
   * Colunas ocultas mantêm sua posição relativa absoluta; só a sequência das visíveis muda.
   */
  readonly reorder = (previousIndex: number, currentIndex: number): void => {
    if (previousIndex === currentIndex) {
      return;
    }
    const ordemCompleta = this.orderedColumns().map((column) => column.key);
    const visiveisAntes = ordemCompleta.filter((key) => this.isVisible(key));
    const visiveisDepois = [...visiveisAntes];
    const [movida] = visiveisDepois.splice(previousIndex, 1);
    visiveisDepois.splice(currentIndex, 0, movida);

    let cursor = 0;
    const novaOrdem = ordemCompleta.map((key) => (this.isVisible(key) ? visiveisDepois[cursor++] : key));
    this.columnOrder.set(novaOrdem);
    this.persistirLista(this.chaveOrdem(), novaOrdem);
  };

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
    const salvo = this.lerLista(chave);
    if (!salvo) {
      return;
    }
    const validas = new Set(salvo.filter((key) => this.opts.columns().some((column) => column.key === key)));
    if (validas.size > 0) {
      this.visibleKeysOverride.set(validas);
    }
  }

  /** Chame isso num `effect` do construtor do dono, junto com `carregarStorage()`. */
  carregarOrdemStorage(): void {
    if (this.carregouOrdem) {
      return;
    }
    const chave = this.chaveOrdem();
    if (!chave) {
      return;
    }
    this.carregouOrdem = true;
    const salvo = this.lerLista(chave);
    if (salvo && salvo.length > 0) {
      this.columnOrder.set(salvo);
    }
  }

  private currentKeys(): Set<string> {
    return this.visibleKeysOverride() ?? this.defaultKeys();
  }

  private defaultKeys(): Set<string> {
    const defaults = this.opts.defaultVisibleColumns?.() ?? null;
    return defaults ? new Set(defaults) : new Set(this.opts.columns().map((column) => column.key));
  }

  private chaveOrdem(): string | null {
    const chave = this.opts.storageKey?.() ?? null;
    return chave ? `${chave}.ordem` : null;
  }

  private lerLista(chave: string): string[] | null {
    try {
      const salvo = this.document.defaultView?.localStorage.getItem(chave);
      if (!salvo) {
        return null;
      }
      const lista = JSON.parse(salvo);
      return Array.isArray(lista) && lista.every((item) => typeof item === 'string') ? lista : null;
    } catch {
      return null;
    }
  }

  private persistirLista(chave: string | null, lista: string[]): void {
    if (!chave) {
      return;
    }
    try {
      this.document.defaultView?.localStorage.setItem(chave, JSON.stringify(lista));
    } catch {
      /* storage indisponível — a escolha vale só nesta sessão */
    }
  }
}
