import { formatCurrency, getCurrencySymbol } from '@angular/common';
import { Pipe, PipeTransform } from '@angular/core';

import { CURRENCY } from '../../core/constants/app-constants';

/** Formata valores monetários em Real brasileiro (R$ 1.234,56). */
@Pipe({ name: 'currencyFormat' })
export class CurrencyFormatPipe implements PipeTransform {
  transform(
    value: number | string | null | undefined,
    display: 'symbol' | 'code' = 'symbol',
  ): string {
    if (value == null || value === '') {
      return '—';
    }
    const amount = typeof value === 'string' ? Number(value) : value;
    if (Number.isNaN(amount)) {
      return '—';
    }
    const symbol =
      display === 'symbol'
        ? getCurrencySymbol(CURRENCY.CODE, 'narrow', CURRENCY.LOCALE)
        : CURRENCY.CODE;
    return formatCurrency(amount, CURRENCY.LOCALE, symbol, CURRENCY.CODE, '1.2-2');
  }
}
