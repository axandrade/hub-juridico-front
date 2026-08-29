import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { DateFormatPipe } from '../../pipes/date-format.pipe';
import { CurrencyFormatPipe } from '../../pipes/currency-format.pipe';
import { BadgeComponent } from '../badge/badge.component';
import { TableColumn } from './table-column.model';

/** Tabela de dados genérica, estilizada com a paleta botânica. */
@Component({
  selector: 'app-data-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DateFormatPipe, CurrencyFormatPipe, BadgeComponent],
  templateUrl: './data-table.component.html',
  styleUrl: './data-table.component.scss',
})
export class DataTableComponent<T extends Record<string, unknown>> {
  readonly columns = input.required<TableColumn<T>[]>();
  readonly data = input.required<T[]>();
  readonly loading = input<boolean>(false);
  readonly emptyMessage = input<string>('Nenhum registro encontrado.');
  readonly trackKey = input<(keyof T & string) | null>(null);

  readonly rowClick = output<T>();

  protected cellValue(row: T, column: TableColumn<T>): unknown {
    return row[column.key];
  }

  protected dateValue(row: T, column: TableColumn<T>): Date | string | number | null {
    const raw = this.cellValue(row, column);
    return raw instanceof Date || typeof raw === 'string' || typeof raw === 'number'
      ? raw
      : null;
  }

  protected numberValue(row: T, column: TableColumn<T>): number | string | null {
    const raw = this.cellValue(row, column);
    return typeof raw === 'number' || typeof raw === 'string' ? raw : null;
  }

  protected displayValue(row: T, column: TableColumn<T>): string {
    const raw = this.cellValue(row, column);
    if (column.formatter) {
      return column.formatter(raw, row);
    }
    return raw == null ? '' : String(raw);
  }

  protected trackRow = (index: number, row: T): unknown => {
    const key = this.trackKey();
    return key ? row[key] : index;
  };
}
