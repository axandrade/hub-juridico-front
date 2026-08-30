import { FormControl } from '@angular/forms';

import { cpfValidator, isValidCpf, maskCpf, onlyDigits } from './cpf';

describe('cpf helpers', () => {
  it('onlyDigits remove máscara', () => {
    expect(onlyDigits('017.869.783-42')).toBe('01786978342');
    expect(onlyDigits(null)).toBe('');
  });

  it('maskCpf formata progressivamente', () => {
    expect(maskCpf('017')).toBe('017');
    expect(maskCpf('017869')).toBe('017.869');
    expect(maskCpf('01786978')).toBe('017.869.78');
    expect(maskCpf('01786978342')).toBe('017.869.783-42');
    expect(maskCpf('0178697834299')).toBe('017.869.783-42');
  });

  it('isValidCpf valida dígitos verificadores', () => {
    expect(isValidCpf('017.869.783-42')).toBe(true);
    expect(isValidCpf('390.533.447-05')).toBe(true);
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCpf('017.869.783-43')).toBe(false);
    expect(isValidCpf('123')).toBe(false);
  });

  it('cpfValidator: vazio é válido, inválido marca erro', () => {
    expect(cpfValidator(new FormControl(''))).toBeNull();
    expect(cpfValidator(new FormControl('017.869.783-42'))).toBeNull();
    expect(cpfValidator(new FormControl('000.000.000-00'))).toEqual({ cpf: true });
  });
});
