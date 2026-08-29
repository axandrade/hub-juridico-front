import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';

import { DateFormatPipe } from './date-format.pipe';

registerLocaleData(localePt);

describe('DateFormatPipe', () => {
  const pipe = new DateFormatPipe();

  it('formata Date no padrão dd/MM/yyyy', () => {
    expect(pipe.transform(new Date(2026, 8, 15))).toBe('15/09/2026');
  });

  it('aceita string ISO', () => {
    expect(pipe.transform('2026-08-09T00:00:00')).toBe('09/08/2026');
  });

  it('retorna travessão para valores vazios', () => {
    expect(pipe.transform(null)).toBe('—');
    expect(pipe.transform('')).toBe('—');
  });

  it('retorna travessão para datas inválidas', () => {
    expect(pipe.transform('não é data')).toBe('—');
  });
});
