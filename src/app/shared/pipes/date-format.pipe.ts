import { formatDate } from '@angular/common';
import { Pipe, PipeTransform } from '@angular/core';

import { DATE_FORMAT } from '../../core/constants/app-constants';

/** Formata datas no padrão pt-BR (dd/MM/yyyy por default). */
@Pipe({ name: 'dateFormat' })
export class DateFormatPipe implements PipeTransform {
  transform(
    value: Date | string | number | null | undefined,
    pattern: string = DATE_FORMAT.SHORT,
  ): string {
    if (value == null || value === '') {
      return '—';
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '—';
    }
    return formatDate(date, pattern, DATE_FORMAT.LOCALE);
  }
}
