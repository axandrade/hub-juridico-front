import { FormControl, FormGroup, ValidatorFn, Validators } from '@angular/forms';

import { cpfValidator } from '../../../core/auth/documentos-br';
import { EstadoCivil } from '../../../core/models';
import { AdvogadoApi } from '../services/advogado-api.model';
import { AdvogadoEditavel } from '../services/advogado-service';

/**
 * `FormGroup` do cadastro/edição de advogado. Entidade plana (sem herança, sub-recursos ou
 * endereço estruturado), então um grupo único de `FormControl<string>` — bem mais simples que
 * `ClientForm`.
 */
export type AdvogadoForm = FormGroup<{
  nome: FormControl<string>;
  cpf: FormControl<string>;
  rg: FormControl<string>;
  oab: FormControl<string>;
  profissao: FormControl<string>;
  nacionalidade: FormControl<string>;
  estadoCivil: FormControl<string>;
  email: FormControl<string>;
  telefoneWhatsapp: FormControl<string>;
  enderecoProfissional: FormControl<string>;
  cepProfissional: FormControl<string>;
  cidadeProfissional: FormControl<string>;
  observacoes: FormControl<string>;
}>;

function text(validators: ValidatorFn[] = []): FormControl<string> {
  return new FormControl('', { nonNullable: true, validators });
}

export function createAdvogadoForm(): AdvogadoForm {
  return new FormGroup({
    nome: text([Validators.required]),
    cpf: text([cpfValidator]),
    rg: text(),
    oab: text(),
    profissao: text(),
    nacionalidade: text(),
    estadoCivil: text(),
    email: text([Validators.email]),
    telefoneWhatsapp: text(),
    enderecoProfissional: text(),
    cepProfissional: text(),
    cidadeProfissional: text(),
    observacoes: text(),
  });
}

export function patchAdvogadoForm(form: AdvogadoForm, advogado: AdvogadoApi): void {
  form.patchValue(
    {
      nome: advogado.nome ?? '',
      cpf: advogado.cpf ?? '',
      rg: advogado.rg ?? '',
      oab: advogado.oab ?? '',
      profissao: advogado.profissao ?? '',
      nacionalidade: advogado.nacionalidade ?? '',
      estadoCivil: advogado.estado_civil ?? '',
      email: advogado.email ?? '',
      telefoneWhatsapp: advogado.telefone_whatsapp ?? '',
      enderecoProfissional: advogado.endereco_profissional ?? '',
      cepProfissional: advogado.cep_profissional ?? '',
      cidadeProfissional: advogado.cidade_profissional ?? '',
      observacoes: advogado.observacoes ?? '',
    },
    { emitEvent: false },
  );
  form.markAsPristine();
  form.markAsUntouched();
  form.updateValueAndValidity({ emitEvent: false });
}

export function readAdvogadoForm(form: AdvogadoForm): Omit<AdvogadoEditavel, 'id'> {
  const raw = form.getRawValue();
  return {
    ...raw,
    estadoCivil: (raw.estadoCivil || '') as EstadoCivil | '',
  };
}
