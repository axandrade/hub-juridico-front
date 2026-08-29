export type TableColumnAlign = 'left' | 'center' | 'right';
export type TableCellFormat = 'text' | 'date' | 'currency' | 'badge';

export interface TableColumn<T = Record<string, unknown>> {
  /** Chave do objeto de dados (aceita caminho simples, ex.: "status"). */
  key: keyof T & string;
  /** Rótulo exibido no cabeçalho. */
  header: string;
  align?: TableColumnAlign;
  width?: string;
  format?: TableCellFormat;
  /** Transforma o valor bruto em texto para exibição. */
  formatter?: (value: unknown, row: T) => string;
}
