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
