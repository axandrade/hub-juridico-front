import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Remove tudo que não for dígito. */
export function onlyDigits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

/** Aplica a máscara `000.000.000-00` progressivamente. */
export function maskCpf(value: string | null | undefined): string {
  const d = onlyDigits(value).slice(0, 11);
  const parts = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9), d.slice(9, 11)].filter(Boolean);

  if (parts.length <= 1) {
    return parts.join('');
  }
  let out = parts[0];
  if (parts[1]) out += `.${parts[1]}`;
  if (parts[2]) out += `.${parts[2]}`;
  if (parts[3]) out += `-${parts[3]}`;
  return out;
}

/** Aplica a máscara `00.000.000/0000-00` progressivamente. */
export function maskCnpj(value: string | null | undefined): string {
  const d = onlyDigits(value).slice(0, 14);
  const parts = [
    d.slice(0, 2),
    d.slice(2, 5),
    d.slice(5, 8),
    d.slice(8, 12),
    d.slice(12, 14),
  ].filter(Boolean);

  if (parts.length <= 1) {
    return parts.join('');
  }
  let out = parts[0];
  if (parts[1]) out += `.${parts[1]}`;
  if (parts[2]) out += `.${parts[2]}`;
  if (parts[3]) out += `/${parts[3]}`;
  if (parts[4]) out += `-${parts[4]}`;
  return out;
}

/** Aplica a máscara `00000-000` progressivamente. */
export function maskCep(value: string | null | undefined): string {
  const d = onlyDigits(value).slice(0, 8);
  if (d.length <= 5) {
    return d;
  }
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

/**
 * Máscara combinada CPF/CNPJ: enquanto tiver até 11 dígitos usa a máscara de
 * CPF; a partir do 12º dígito passa a formatar como CNPJ. Usada no campo
 * `documento` do representante (legal ou financeiro), que aceita os dois.
 */
export function maskDocumento(value: string | null | undefined): string {
  const d = onlyDigits(value).slice(0, 14);
  return d.length > 11 ? maskCnpj(d) : maskCpf(d);
}

/**
 * Valida CNPJ (dígitos verificadores) — porta de
 * `com.hubjuridico.shared.util.CnpjUtils.isValid` do back-end.
 */
export function isValidCnpj(value: string | null | undefined): boolean {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || cnpj === cnpj[0].repeat(14)) {
    return false;
  }
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const digits = cnpj.split('').map(Number);

  const checkDigit = (base: number[], weights: number[]): number => {
    const sum = base.reduce((acc, d, i) => acc + d * weights[i], 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };

  const d1 = checkDigit(digits.slice(0, 12), weights1);
  const d2 = checkDigit(digits.slice(0, 12).concat(d1), weights2);
  return d1 === digits[12] && d2 === digits[13];
}

/** Valida um documento como CPF (11 dígitos) ou CNPJ (14 dígitos) — espelha `@Documento` do back-end. */
export function isValidDocumento(value: string | null | undefined): boolean {
  const digits = onlyDigits(value);
  if (digits.length === 11) return isValidCpf(digits);
  if (digits.length === 14) return isValidCnpj(digits);
  return false;
}

/** Validador de `FormControl` para documento (CPF ou CNPJ, mascarado ou só dígitos). */
export const documentoValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const value = (control.value ?? '') as string;
  if (!value) {
    return null;
  }
  return isValidDocumento(value) ? null : { documento: true };
};

/**
 * Valida CPF (dígitos verificadores) — porta de
 * `apps/common/validators.py::is_valid_cpf` do back-end.
 */
export function isValidCpf(value: string | null | undefined): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || cpf === cpf[0].repeat(11)) {
    return false;
  }
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i++) {
      sum += Number(cpf[i]) * (len + 1 - i);
    }
    let check = (sum * 10) % 11;
    if (check === 10) check = 0;
    if (check !== Number(cpf[len])) {
      return false;
    }
  }
  return true;
}

/** Validador de `FormControl` para CPF (aceita valor mascarado ou só dígitos). */
export const cpfValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = (control.value ?? '') as string;
  if (!value) {
    return null;
  }
  return isValidCpf(value) ? null : { cpf: true };
};
