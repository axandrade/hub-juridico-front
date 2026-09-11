import { FormControl, FormGroup, ValidatorFn } from '@angular/forms';

import { documentoValidator, maskDocumento } from '../../../core/auth/documentos-br';
import { ProcessoApi } from '../services/processo-api.model';

/**
 * `FormGroup` da aba "Informações básicas" do processo — só os campos de texto/data/textarea.
 * Os campos que usam `<app-combobox>` (tipo, status, ação, natureza, procedimento, fase, cidade,
 * posição do cliente, posição da parte contrária, UF, cliente principal, advogado responsável) e
 * as listas (tags, órgãos, escritórios) ficam em signals no componente, porque o combobox trabalha
 * por `[value]`/`(valueChange)`, não por `formControlName`.
 */
export type ProcessoForm = FormGroup<{
  numeroCnj: FormControl<string>;
  contrarioPrincipalNome: FormControl<string>;
  contrarioPrincipalDocumento: FormControl<string>;
  dataDistribuicao: FormControl<string>;
  observacoesGerais: FormControl<string>;
  destacarObservacao: FormControl<boolean>;
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
    observacoesGerais: text(),
    destacarObservacao: new FormControl(false, { nonNullable: true }),
  });
}

export function patchProcessoForm(form: ProcessoForm, p: ProcessoApi): void {
  form.patchValue(
    {
      numeroCnj: p.numero_cnj ?? '',
      contrarioPrincipalNome: p.contrario_principal_nome ?? '',
      contrarioPrincipalDocumento: maskDocumento(p.contrario_principal_documento),
      dataDistribuicao: p.data_distribuicao ?? '',
      observacoesGerais: p.observacoes_gerais ?? '',
      destacarObservacao: p.destacar_observacao,
    },
    { emitEvent: false },
  );
  form.markAsPristine();
  form.markAsUntouched();
  form.updateValueAndValidity({ emitEvent: false });
}
