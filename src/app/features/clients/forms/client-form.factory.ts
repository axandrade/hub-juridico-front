import { FormArray, FormControl, FormGroup, Validators } from '@angular/forms';

import {
  ClientHiringMode,
  ClientStatus,
  ContactType,
  IAddress,
  IClient,
  IContact,
  IEmail,
  ILegalRepresentative,
  MaritalStatus,
  PersonType,
} from '../../../core/models';

export type AddressGroup = FormGroup<{
  street: FormControl<string>;
  number: FormControl<string>;
  complement: FormControl<string>;
  district: FormControl<string>;
  city: FormControl<string>;
  state: FormControl<string>;
  zipCode: FormControl<string>;
}>;

export type EmailGroup = FormGroup<{
  address: FormControl<string>;
  primary: FormControl<boolean>;
}>;

export type ContactGroup = FormGroup<{
  value: FormControl<string>;
  type: FormControl<ContactType>;
  primary: FormControl<boolean>;
}>;

export type RepresentativeGroup = FormGroup<{
  name: FormControl<string>;
  cpf: FormControl<string>;
  position: FormControl<string>;
  address: AddressGroup;
  emails: FormArray<EmailGroup>;
  contacts: FormArray<ContactGroup>;
}>;

export type NaturalPersonGroup = FormGroup<{
  name: FormControl<string>;
  cpf: FormControl<string>;
  rg: FormControl<string>;
  occupation: FormControl<string>;
  nationality: FormControl<string>;
  maritalStatus: FormControl<string>;
}>;

export type LegalPersonGroup = FormGroup<{
  legalName: FormControl<string>;
  tradeName: FormControl<string>;
  cnpj: FormControl<string>;
  stateRegistration: FormControl<string>;
  municipalRegistration: FormControl<string>;
  representatives: FormArray<RepresentativeGroup>;
}>;

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
  personType: FormControl<PersonType>;
  address: AddressGroup;
  emails: FormArray<EmailGroup>;
  contacts: FormArray<ContactGroup>;
  naturalPerson: NaturalPersonGroup;
  legalPerson: LegalPersonGroup;
  dossier: DossierGroup;
}>;

export type ClientEditableFields = Omit<IClient, 'id' | 'registeredAt' | 'favorite'>;

function text(value = ''): FormControl<string> {
  return new FormControl(value, { nonNullable: true });
}

function required(value = ''): FormControl<string> {
  return new FormControl(value, { nonNullable: true, validators: [Validators.required] });
}

function flag(value = false): FormControl<boolean> {
  return new FormControl(value, { nonNullable: true });
}

export function createAddressGroup(value?: Partial<IAddress>): AddressGroup {
  return new FormGroup({
    street: text(value?.street),
    number: text(value?.number),
    complement: text(value?.complement),
    district: text(value?.district),
    city: text(value?.city),
    state: text(value?.state),
    zipCode: text(value?.zipCode),
  });
}

export function createEmailGroup(value?: Partial<IEmail>): EmailGroup {
  return new FormGroup({ address: text(value?.address), primary: flag(value?.primary) });
}

export function createContactGroup(value?: Partial<IContact>): ContactGroup {
  return new FormGroup({
    value: text(value?.value),
    type: new FormControl<ContactType>(value?.type ?? 'WHATSAPP', { nonNullable: true }),
    primary: flag(value?.primary),
  });
}

export function createRepresentativeGroup(
  value?: Partial<ILegalRepresentative>,
): RepresentativeGroup {
  return new FormGroup({
    name: text(value?.name),
    cpf: text(value?.cpf),
    position: text(value?.position),
    address: createAddressGroup(value?.address),
    emails: new FormArray((value?.emails ?? []).map((email) => createEmailGroup(email))),
    contacts: new FormArray((value?.contacts ?? []).map((contact) => createContactGroup(contact))),
  });
}

function createNaturalPersonGroup(): NaturalPersonGroup {
  return new FormGroup({
    name: required(),
    cpf: required(),
    rg: text(),
    occupation: text(),
    nationality: text(),
    maritalStatus: text(),
  });
}

function createLegalPersonGroup(): LegalPersonGroup {
  return new FormGroup({
    legalName: required(),
    tradeName: text(),
    cnpj: required(),
    stateRegistration: text(),
    municipalRegistration: text(),
    representatives: new FormArray<RepresentativeGroup>([]),
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
    personType: new FormControl<PersonType>('NATURAL', { nonNullable: true }),
    address: createAddressGroup(),
    emails: new FormArray<EmailGroup>([]),
    contacts: new FormArray<ContactGroup>([]),
    naturalPerson: createNaturalPersonGroup(),
    legalPerson: createLegalPersonGroup(),
    dossier: createDossierGroup(),
  });
  setPersonType(form, 'NATURAL');
  return form;
}

/**
 * Habilita o grupo de identidade da natureza escolhida e desabilita o outro — o
 * grupo desabilitado sai de `form.valid`/`.value` (mas continua em
 * `getRawValue()`), então os validators `required` só valem para o tipo ativo.
 */
export function setPersonType(form: ClientForm, type: PersonType): void {
  // Emite valueChanges (sem { emitEvent: false }) para que os signals derivados
  // do formulário reajam à troca de natureza.
  form.controls.personType.setValue(type);

  const natural = form.controls.naturalPerson;
  const legal = form.controls.legalPerson;

  if (type === 'NATURAL') {
    legal.disable({ emitEvent: false });
    natural.enable({ emitEvent: false });
  } else {
    natural.disable({ emitEvent: false });
    legal.enable({ emitEvent: false });
  }
}

export function patchClientForm(form: ClientForm, client: IClient): void {
  form.controls.address.patchValue(client.address, { emitEvent: false });
  form.controls.naturalPerson.patchValue(client.naturalPerson, { emitEvent: false });
  form.controls.legalPerson.patchValue(
    {
      legalName: client.legalPerson.legalName,
      tradeName: client.legalPerson.tradeName,
      cnpj: client.legalPerson.cnpj,
      stateRegistration: client.legalPerson.stateRegistration,
      municipalRegistration: client.legalPerson.municipalRegistration,
    },
    { emitEvent: false },
  );
  form.controls.dossier.patchValue(client.dossier, { emitEvent: false });

  fillFormArray(form.controls.emails, client.emails, createEmailGroup);
  fillFormArray(form.controls.contacts, client.contacts, createContactGroup);
  fillFormArray(
    form.controls.legalPerson.controls.representatives,
    client.legalPerson.representatives,
    createRepresentativeGroup,
  );

  setPersonType(form, client.personType);
  form.markAsPristine();
  form.markAsUntouched();
  form.updateValueAndValidity();
}

export function readClientForm(form: ClientForm): ClientEditableFields {
  const raw = form.getRawValue();

  return {
    personType: raw.personType,
    address: raw.address,
    emails: raw.emails,
    contacts: raw.contacts,
    naturalPerson: {
      ...raw.naturalPerson,
      maritalStatus: raw.naturalPerson.maritalStatus as MaritalStatus | '',
    },
    legalPerson: raw.legalPerson,
    dossier: {
      ...raw.dossier,
      status: (raw.dossier.status || 'active') as ClientStatus,
      hiringMode: raw.dossier.hiringMode as ClientHiringMode | '',
    },
  };
}

function fillFormArray<T, G extends FormGroup>(
  array: FormArray<G>,
  items: readonly T[],
  make: (item: T) => G,
): void {
  array.clear({ emitEvent: false });
  for (const item of items) {
    array.push(make(item), { emitEvent: false });
  }
  // Emite uma vez para os editores de lista (OnPush) reagirem à reconstrução.
  array.updateValueAndValidity();
}
