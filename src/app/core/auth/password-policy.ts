import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Política de senha — espelha `security.auth.password` do hub-juridico-api
 * (min 12, maiúscula + minúscula + dígito + símbolo). Validação no cliente é só
 * feedback rápido; o servidor continua sendo a autoridade.
 */
export const PASSWORD_MIN_LENGTH = 12;

const RULES: readonly { test: RegExp; label: string }[] = [
  { test: /[A-Z]/, label: 'uma letra maiúscula' },
  { test: /[a-z]/, label: 'uma letra minúscula' },
  { test: /[0-9]/, label: 'um número' },
  { test: /[^A-Za-z0-9]/, label: 'um caractere especial' },
];

/** Lista de requisitos não atendidos por `value` (vazia = senha forte). */
export function passwordWeaknesses(value: string): string[] {
  const missing: string[] = [];
  if (value.length < PASSWORD_MIN_LENGTH) {
    missing.push(`ter ao menos ${PASSWORD_MIN_LENGTH} caracteres`);
  }
  for (const rule of RULES) {
    if (!rule.test.test(value)) {
      missing.push(rule.label);
    }
  }
  return missing;
}

/** Valida a força da senha em um `FormControl`. */
export const strongPasswordValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const value = (control.value ?? '') as string;
  if (!value) {
    return null;
  }
  const missing = passwordWeaknesses(value);
  return missing.length ? { weakPassword: { missing } } : null;
};

/**
 * Valida, num `FormGroup`, que dois controles têm o mesmo valor.
 * Devolve o erro `passwordsMismatch` no próprio grupo (sem mutar os filhos,
 * evitando loops de revalidação).
 */
export function passwordsMatchValidator(passwordKey: string, confirmKey: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const password = group.get(passwordKey)?.value;
    const confirm = group.get(confirmKey)?.value;
    if (!confirm) {
      return null;
    }
    return password === confirm ? null : { passwordsMismatch: true };
  };
}

/** Mensagem única a partir dos requisitos faltantes. */
export function weakPasswordMessage(missing: string[]): string {
  return `A senha deve conter ${missing.join(', ')}.`;
}
