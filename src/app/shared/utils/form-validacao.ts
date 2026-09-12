import { AbstractControl, FormArray, FormGroup } from '@angular/forms';

export type RotulosCampos = Record<string, string>;
export type MensagensErroPorChave = Partial<Record<string, string>>;

/**
 * Percorre um `FormGroup`/`FormArray` (recursivo, cobre `FormArray` de `FormGroup` como os
 * representantes do client-form) coletando os controles inválidos e desabilitados de fora —
 * monta uma frase por campo usando `rotulos` (chave = nome do control-folha, mesma convenção de
 * `CLIENT_FIELD_LABELS`). Erro `required` vira "não preenchido"; qualquer outro erro vira "formato
 * inválido", a menos que `mensagensErro` tenha uma frase específica pra aquela chave de erro
 * (ex.: `{ email: 'formato de e-mail inválido' }`).
 */
export function mensagensCamposInvalidos(
  control: AbstractControl,
  rotulos: RotulosCampos,
  mensagensErro: MensagensErroPorChave = {},
): string[] {
  const mensagens: string[] = [];
  coletarInvalidos(control, rotulos, mensagensErro, mensagens);
  return mensagens;
}

function coletarInvalidos(
  control: AbstractControl,
  rotulos: RotulosCampos,
  mensagensErro: MensagensErroPorChave,
  mensagens: string[],
  chave?: string,
): void {
  if (control.disabled) {
    return;
  }
  if (control instanceof FormGroup) {
    Object.entries(control.controls).forEach(([chaveFilho, filho]) =>
      coletarInvalidos(filho, rotulos, mensagensErro, mensagens, chaveFilho),
    );
    return;
  }
  if (control instanceof FormArray) {
    control.controls.forEach((filho) => coletarInvalidos(filho, rotulos, mensagensErro, mensagens, chave));
    return;
  }
  if (control.valid || !chave) {
    return;
  }
  const rotulo = rotulos[chave] ?? chave;
  const chaveErro = Object.keys(control.errors ?? {})[0];
  if (chaveErro === 'required') {
    mensagens.push(`${rotulo} não preenchido`);
  } else {
    mensagens.push(`${rotulo}: ${mensagensErro[chaveErro] ?? 'formato inválido'}`);
  }
}
