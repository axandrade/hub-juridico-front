import { AbstractControl, FormArray, FormControl, FormGroup, Validators } from '@angular/forms';

import {
  ModalidadeCliente,
  StatusCliente,
  EstadoCivil,
  IPessoa,
  IContato,
  IEmail,
  IEndereco,
  IRepresentanteLegal,
  TipoContato,
  TipoPessoa,
} from '../../../core/models';

export type EnderecoGroup = FormGroup<{
  logradouro: FormControl<string>;
  numero: FormControl<string>;
  complemento: FormControl<string>;
  bairro: FormControl<string>;
  cidade: FormControl<string>;
  cep: FormControl<string>;
  uf: FormControl<string>;
}>;

export type EmailGroup = FormGroup<{
  endereco: FormControl<string>;
  principal: FormControl<boolean>;
}>;

export type ContatoGroup = FormGroup<{
  valor: FormControl<string>;
  tipo: FormControl<TipoContato>;
  principal: FormControl<boolean>;
}>;

export type RepresentanteGroup = FormGroup<{
  nome: FormControl<string>;
  cpf: FormControl<string>;
  cargo: FormControl<string>;
  endereco: EnderecoGroup;
  emails: FormArray<EmailGroup>;
  contatos: FormArray<ContatoGroup>;
}>;

export type PessoaGroup = FormGroup<{
  tipo: FormControl<TipoPessoa>;
  endereco: EnderecoGroup;
  emails: FormArray<EmailGroup>;
  contatos: FormArray<ContatoGroup>;
  nome: FormControl<string>;
  cpf: FormControl<string>;
  rg: FormControl<string>;
  profissao: FormControl<string>;
  nacionalidade: FormControl<string>;
  estadoCivil: FormControl<string>;
  razaoSocial: FormControl<string>;
  nomeFantasia: FormControl<string>;
  cnpj: FormControl<string>;
  inscricaoEstadual: FormControl<string>;
  inscricaoMunicipal: FormControl<string>;
  representantes: FormArray<RepresentanteGroup>;
}>;

/** Controles obrigatórios apenas quando a pessoa é do `tipo` correspondente. */
const REQUIRED_BY_TIPO_PESSOA: Record<TipoPessoa, readonly string[]> = {
  FISICA: ['nome', 'cpf'],
  JURIDICA: ['razaoSocial', 'cnpj'],
};

export type DossierGroup = FormGroup<{
  folder: FormControl<string>;
  file: FormControl<string>;
  status: FormControl<string>;
  hiringMode: FormControl<string>;
  contractNumber: FormControl<string>;
  contractDate: FormControl<string>;
  referredBy: FormControl<string>;
  internalOwner: FormControl<string>;
  registeredBy: FormControl<string>;
  notes: FormControl<string>;
  progressEntry: FormControl<string>;
  progressHistory: FormControl<string>;
}>;

export type ClientForm = FormGroup<{
  pessoa: PessoaGroup;
  dossier: DossierGroup;
}>;

export type ClientEditableFields = Omit<IPessoa, 'id' | 'registeredAt' | 'favorite'>;

function text(value = ''): FormControl<string> {
  return new FormControl(value, { nonNullable: true });
}

function flag(value = false): FormControl<boolean> {
  return new FormControl(value, { nonNullable: true });
}

export function createEnderecoGroup(value?: Partial<IEndereco>): EnderecoGroup {
  return new FormGroup({
    logradouro: text(value?.logradouro),
    numero: text(value?.numero),
    complemento: text(value?.complemento),
    bairro: text(value?.bairro),
    cidade: text(value?.cidade),
    cep: text(value?.cep),
    uf: text(value?.uf),
  });
}

export function createEmailGroup(value?: Partial<IEmail>): EmailGroup {
  return new FormGroup({ endereco: text(value?.endereco), principal: flag(value?.principal) });
}

export function createContatoGroup(value?: Partial<IContato>): ContatoGroup {
  return new FormGroup({
    valor: text(value?.valor),
    tipo: new FormControl<TipoContato>(value?.tipo ?? 'WHATSAPP', { nonNullable: true }),
    principal: flag(value?.principal),
  });
}

export function createRepresentanteGroup(
  value?: Partial<IRepresentanteLegal>,
): RepresentanteGroup {
  return new FormGroup({
    nome: text(value?.nome),
    cpf: text(value?.cpf),
    cargo: text(value?.cargo),
    endereco: createEnderecoGroup(value?.endereco),
    emails: new FormArray((value?.emails ?? []).map((email) => createEmailGroup(email))),
    contatos: new FormArray((value?.contatos ?? []).map((contato) => createContatoGroup(contato))),
  });
}

function createPessoaGroup(): PessoaGroup {
  return new FormGroup({
    tipo: new FormControl<TipoPessoa>('FISICA', { nonNullable: true }),
    endereco: createEnderecoGroup(),
    emails: new FormArray<EmailGroup>([]),
    contatos: new FormArray<ContatoGroup>([]),
    nome: text(),
    cpf: text(),
    rg: text(),
    profissao: text(),
    nacionalidade: text(),
    estadoCivil: text(),
    razaoSocial: text(),
    nomeFantasia: text(),
    cnpj: text(),
    inscricaoEstadual: text(),
    inscricaoMunicipal: text(),
    representantes: new FormArray<RepresentanteGroup>([]),
  });
}

function createDossierGroup(): DossierGroup {
  return new FormGroup({
    folder: text(),
    file: text(),
    status: text('active'),
    hiringMode: text(),
    contractNumber: text(),
    contractDate: text(),
    referredBy: text(),
    internalOwner: text(),
    registeredBy: text(),
    notes: text(),
    progressEntry: text(),
    progressHistory: text(),
  });
}

export function createClientForm(): ClientForm {
  const form: ClientForm = new FormGroup({
    pessoa: createPessoaGroup(),
    dossier: createDossierGroup(),
  });
  setTipoPessoa(form, 'FISICA');
  return form;
}

/**
 * Aplica a natureza jurídica escolhida: grava `pessoa.tipo` e mantém os
 * validators `required` apenas nos campos de identidade do tipo ativo (os do
 * outro tipo ficam opcionais, mas continuam no formulário).
 */
export function setTipoPessoa(form: ClientForm, tipo: TipoPessoa): void {
  const pessoa = form.controls.pessoa;

  // Emite valueChanges (sem { emitEvent: false }) para que os signals derivados
  // do formulário reajam à troca de natureza.
  pessoa.controls.tipo.setValue(tipo);

  for (const [tipoPessoa, keys] of Object.entries(REQUIRED_BY_TIPO_PESSOA)) {
    for (const key of keys) {
      setRequired(pessoa.get(key)!, tipoPessoa === tipo);
    }
  }
}

function setRequired(control: AbstractControl, isRequired: boolean): void {
  control.setValidators(isRequired ? [Validators.required] : []);
  control.updateValueAndValidity({ emitEvent: false });
}

export function patchClientForm(form: ClientForm, client: IPessoa): void {
  const pessoa = form.controls.pessoa;
  const { pessoa: source } = client;

  pessoa.patchValue(
    {
      tipo: source.tipo,
      nome: source.nome,
      cpf: source.cpf,
      rg: source.rg,
      profissao: source.profissao,
      nacionalidade: source.nacionalidade,
      estadoCivil: source.estadoCivil,
      razaoSocial: source.razaoSocial,
      nomeFantasia: source.nomeFantasia,
      cnpj: source.cnpj,
      inscricaoEstadual: source.inscricaoEstadual,
      inscricaoMunicipal: source.inscricaoMunicipal,
    },
    { emitEvent: false },
  );
  pessoa.controls.endereco.patchValue(source.endereco, { emitEvent: false });
  form.controls.dossier.patchValue(client.dossier, { emitEvent: false });

  // `setControl` (em vez de limpar/reencher no lugar) troca a referência do
  // `FormArray` — assim o `[array]` dos editores `client-*` (OnPush) muda e eles
  // re-renderizam a lista da pessoa recém-carregada.
  pessoa.setControl('emails', new FormArray(source.emails.map((e) => createEmailGroup(e))));
  pessoa.setControl('contatos', new FormArray(source.contatos.map((c) => createContatoGroup(c))));
  pessoa.setControl(
    'representantes',
    new FormArray(source.representantes.map((r) => createRepresentanteGroup(r))),
  );

  setTipoPessoa(form, source.tipo);
  form.markAsPristine();
  form.markAsUntouched();
  form.updateValueAndValidity();
}

export function readClientForm(form: ClientForm): ClientEditableFields {
  const raw = form.getRawValue();

  return {
    pessoa: {
      ...raw.pessoa,
      estadoCivil: raw.pessoa.estadoCivil as EstadoCivil | '',
    },
    dossier: {
      ...raw.dossier,
      status: (raw.dossier.status || 'active') as StatusCliente,
      hiringMode: raw.dossier.hiringMode as ModalidadeCliente | '',
    },
  };
}

