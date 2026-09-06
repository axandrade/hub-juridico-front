import { BadgeTone } from '../badge/badge.component';

export type TableColumnAlign = 'left' | 'center' | 'right';
export type TableCellFormat = 'text' | 'date' | 'currency' | 'badge';

/** Filtro embutido no cabeçalho da coluna — dispara `columnFilterChange` no `app-data-table`. */
export interface TableColumnFilter {
  type: 'text' | 'select';
  /** Só pra `type: 'select'`. `value: ''` = "sem filtro" (limpa a coluna). */
  options?: { value: string; label: string }[];
  /**
   * Nome do campo enviado ao backend (`filter=`), se diferente de `column.key` — ex.: uma coluna
   * "CPF/CNPJ" mesclada (key `cpf`) que filtra por um campo combinado próprio no backend. Sem
   * isso, usa `column.key`.
   */
  field?: string;
}

export interface TableColumn<T = Record<string, unknown>> {
  /** Id da coluna — usado para tracking, ordenação e visibilidade. Não precisa ser uma
   *  propriedade real de `T` (ex.: colunas derivadas de campos aninhados). */
  key: string;
  /** Rótulo exibido no cabeçalho. */
  header: string;
  align?: TableColumnAlign;
  width?: string;
  format?: TableCellFormat;
  /** Transforma o valor bruto em texto para exibição; também vira a chave de ordenação. */
  formatter?: (value: unknown, row: T) => string;
  /** Só usado com `format: 'badge'`. Sem isso, o tom fica `'primary'`. */
  badgeTone?: (value: unknown, row: T) => BadgeTone;
  /** Só usado com `format: 'badge'`. */
  badgeDot?: boolean;
  /** Sem isso, a coluna não ganha campo de filtro na linha de cabeçalho extra. */
  filter?: TableColumnFilter;
}
