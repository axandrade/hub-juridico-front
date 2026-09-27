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

/**
 * Ação por linha na última coluna (ex.: "Marcar como visto"). O clique no botão não dispara o
 * `rowClick` da linha. `visible` esconde o botão nas linhas em que a ação não se aplica.
 */
export interface TableRowAction<T> {
  label: string;
  /** Classe Font Awesome (ex.: `fa-solid fa-check`). */
  icon?: string;
  /** Só o ícone (redondo, discreto); o `label` vira tooltip e rótulo acessível. */
  iconOnly?: boolean;
  /** Cabeçalho da coluna; sem isso, fica vazio. */
  header?: string;
  visible?: (row: T) => boolean;
  onClick: (row: T, event: MouseEvent) => void;
}

/** Ação de "fixar no topo" por linha (ex.: favoritar), com o botão desenhado pela própria tabela. */
export interface TablePinAction<T> {
  isActive: (row: T) => boolean;
  onToggle: (row: T, event: MouseEvent) => void;
  ariaLabel?: string;
}
