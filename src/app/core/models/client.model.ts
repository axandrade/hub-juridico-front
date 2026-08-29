export const CLIENT_NATURES = ['individual', 'company'] as const;
export type ClientNature = (typeof CLIENT_NATURES)[number];

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

export const CLIENT_MARITAL_STATUSES = [
  'single',
  'married',
  'divorced',
  'widowed',
  'stableUnion',
] as const;
export type ClientMaritalStatus = (typeof CLIENT_MARITAL_STATUSES)[number];

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

export interface IClient {
  id: number;
  registeredAt: Date;
  legalNature: ClientNature;
  individualName: string;
  cpf: string;
  identityNumber: string;
  maritalStatus: ClientMaritalStatus | '';
  occupation: string;
  nationality: string;
  individualEmail: string;
  additionalIndividualEmails: string;
  individualWhatsapp: string;
  additionalIndividualPhones: string;
  individualStreet: string;
  individualNumber: string;
  individualComplement: string;
  individualDistrict: string;
  individualState: string;
  individualCity: string;
  individualZipCode: string;
  individualNotes: string;
  companyLegalName: string;
  companyTradeName: string;
  cnpj: string;
  stateRegistration: string;
  municipalRegistration: string;
  companyEmail: string;
  additionalCompanyEmails: string;
  companyWhatsapp: string;
  additionalCompanyPhones: string;
  companyStreet: string;
  companyNumber: string;
  companyComplement: string;
  companyDistrict: string;
  companyState: string;
  companyCity: string;
  companyZipCode: string;
  legalRepresentativeName: string;
  legalRepresentativeCpf: string;
  legalRepresentativeRole: string;
  legalRepresentativeEmail: string;
  additionalRepresentativeEmails: string;
  legalRepresentativeWhatsapp: string;
  additionalRepresentativePhones: string;
  additionalRepresentatives: string;
  companyNotes: string;
  folder: string;
  file: string;
  registeredBy: string;
  status: ClientStatus;
  contractNumber: string;
  contractDate: string;
  hiringMode: ClientHiringMode | '';
  referredBy: string;
  internalOwner: string;
  notes: string;
  progressEntry: string;
  progressHistory: string;
  favorite: boolean;
}
