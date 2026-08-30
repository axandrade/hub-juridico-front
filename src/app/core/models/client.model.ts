export const PERSON_TYPES = ['NATURAL', 'LEGAL'] as const;
export type PersonType = (typeof PERSON_TYPES)[number];

export const CLIENT_STATUSES = ['active', 'prospect', 'inactive', 'closed'] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const CLIENT_HIRING_MODES = [
  'oneOff',
  'monthly',
  'successFee',
  'advisory',
  'litigation',
  'mixed',
] as const;
export type ClientHiringMode = (typeof CLIENT_HIRING_MODES)[number];

/** Espelha `com.hubjuridico.domain.enuns.MaritalStatus`. */
export const MARITAL_STATUSES = [
  'SINGLE',
  'MARRIED',
  'DIVORCED',
  'WIDOWED',
  'STABLE_UNION',
] as const;
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];

/** Espelha `com.hubjuridico.domain.enuns.ContactType`. */
export const CONTACT_TYPES = ['PHONE', 'WHATSAPP'] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

export const BRAZILIAN_STATES = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const;

export const CLIENT_CITIES = ['Fortaleza', 'Juazeiro do Norte', 'Sobral'] as const;

/** Espelha `com.hubjuridico.domain.Address` (embeddable, único por pessoa). */
export interface IAddress {
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  zipCode: string;
}

/** Espelha `com.hubjuridico.domain.Email`. */
export interface IEmail {
  address: string;
  primary: boolean;
}

/** Espelha `com.hubjuridico.domain.Contact`. */
export interface IContact {
  value: string;
  type: ContactType;
  primary: boolean;
}

/** Campos de `com.hubjuridico.domain.NaturalPerson` (+ `occupation`, extra do frontend). */
export interface INaturalPerson {
  name: string;
  cpf: string;
  rg: string;
  occupation: string;
  nationality: string;
  maritalStatus: MaritalStatus | '';
}

/** Espelha `com.hubjuridico.domain.LegalRepresentative` (≈ mini-Person). */
export interface ILegalRepresentative {
  name: string;
  cpf: string;
  position: string;
  address: IAddress;
  emails: IEmail[];
  contacts: IContact[];
}

/** Campos de `com.hubjuridico.domain.LegalPerson`. */
export interface ILegalPerson {
  legalName: string;
  tradeName: string;
  cnpj: string;
  stateRegistration: string;
  municipalRegistration: string;
  representatives: ILegalRepresentative[];
}

/**
 * Metadados do escritório sobre o cliente (pasta, contrato, andamento). Não têm
 * entidade no backend — vivem só no frontend por enquanto.
 */
export interface IClientDossier {
  folder: string;
  file: string;
  status: ClientStatus;
  hiringMode: ClientHiringMode | '';
  contractNumber: string;
  contractDate: string;
  referredBy: string;
  internalOwner: string;
  registeredBy: string;
  notes: string;
  progressEntry: string;
  progressHistory: string;
}

/**
 * Cliente = uma `Person` (natural ou jurídica) + o dossiê do escritório.
 * `naturalPerson` / `legalPerson` sempre existem; apenas o correspondente a
 * `personType` é preenchido/validado.
 */
export interface IClient {
  id: number;
  registeredAt: Date;
  favorite: boolean;
  personType: PersonType;
  address: IAddress;
  emails: IEmail[];
  contacts: IContact[];
  naturalPerson: INaturalPerson;
  legalPerson: ILegalPerson;
  dossier: IClientDossier;
}

export function emptyAddress(): IAddress {
  return {
    street: '',
    number: '',
    complement: '',
    district: '',
    city: '',
    state: '',
    zipCode: '',
  };
}

export function emptyNaturalPerson(): INaturalPerson {
  return { name: '', cpf: '', rg: '', occupation: '', nationality: '', maritalStatus: '' };
}

export function emptyLegalPerson(): ILegalPerson {
  return {
    legalName: '',
    tradeName: '',
    cnpj: '',
    stateRegistration: '',
    municipalRegistration: '',
    representatives: [],
  };
}

export function emptyDossier(): IClientDossier {
  return {
    folder: '',
    file: '',
    status: 'active',
    hiringMode: '',
    contractNumber: '',
    contractDate: '',
    referredBy: '',
    internalOwner: '',
    registeredBy: '',
    notes: '',
    progressEntry: '',
    progressHistory: '',
  };
}

/** E-mail marcado como principal (ou o primeiro, ou vazio). */
export function primaryEmail(emails: readonly IEmail[]): string {
  return (emails.find((email) => email.primary) ?? emails[0])?.address ?? '';
}

/** Contato marcado como principal (ou o primeiro, ou vazio). */
export function primaryContact(contacts: readonly IContact[]): string {
  return (contacts.find((contact) => contact.primary) ?? contacts[0])?.value ?? '';
}
