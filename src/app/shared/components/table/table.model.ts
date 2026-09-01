export type TableSortDirection = 'asc' | 'desc';

export interface TableSort {
  key: string;
  direction: TableSortDirection;
}

/** Estado de paginação (já carregada) que o `app-data-table` só exibe — nunca busca dados sozinho. */
export interface TablePagination {
  /** Página atual confirmada (0-based). */
  page: number;
  totalPages: number;
  totalElements: number;
  /** `true` quando não há próxima página. */
  last: boolean;
}

/** Ação de "fixar no topo" por linha (ex.: favoritar), com o botão desenhado pela própria tabela. */
export interface TablePinAction<T> {
  isActive: (row: T) => boolean;
  onToggle: (row: T, event: MouseEvent) => void;
  ariaLabel?: string;
}
