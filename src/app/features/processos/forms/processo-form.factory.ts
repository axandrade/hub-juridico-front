import { FormControl, FormGroup, ValidatorFn } from '@angular/forms';

import { documentoValidator, maskDocumento } from '../../../core/auth/documentos-br';
import { ProcessoApi } from '../services/processo-api.model';

/**
 * `FormGroup` da aba "Informações básicas" do processo — só os campos de texto/data/textarea.
 * Os campos que usam `<app-combobox>` (tipo, status, ação, natureza, fase, cidade, posição do
 * cliente, posição da parte contrária, UF, cliente principal, advogado responsável) e as listas
 * (tags, órgãos, escritórios) ficam em signals no componente, porque o combobox trabalha por
 * `[value]`/`(valueChange)`, não por `formControlName`.
 */
export type ProcessoForm = FormGroup<{
  numeroCnj: FormControl<string>;
  contrarioPrincipalNome: FormControl<string>;
  contrarioPrincipalDocumento: FormControl<string>;
  dataDistribuicao: FormControl<string>;
  procedimento: FormControl<string>;
  observacoesGerais: FormControl<string>;
}>;

function text(validators: ValidatorFn[] = []): FormControl<string> {
  return new FormControl('', { nonNullable: true, validators });
}

export function createProcessoForm(): ProcessoForm {
  return new FormGroup({
    numeroCnj: text(),
    contrarioPrincipalNome: text(),
    contrarioPrincipalDocumento: text([documentoValidator]),
    dataDistribuicao: text(),
    procedimento: text(),
    observacoesGerais: text(),
  });
}

export function patchProcessoForm(form: ProcessoForm, p: ProcessoApi): void {
  form.patchValue(
    {
      numeroCnj: p.numero_cnj ?? '',
      contrarioPrincipalNome: p.contrario_principal_nome ?? '',
      contrarioPrincipalDocumento: maskDocumento(p.contrario_principal_documento),
      dataDistribuicao: p.data_distribuicao ?? '',
      procedimento: p.procedimento ?? '',
      observacoesGerais: p.observacoes_gerais ?? '',
    },
    { emitEvent: false },
  );
  form.markAsPristine();
  form.markAsUntouched();
  form.updateValueAndValidity({ emitEvent: false });
}
