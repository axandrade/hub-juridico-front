import {
  BRAZILIAN_STATES,
  CLIENT_CITIES,
  CLIENT_HIRING_MODES,
  CLIENT_STATUSES,
  MARITAL_STATUSES,
} from '../../../core/models';

export type ClientInputKind = 'text' | 'email' | 'tel' | 'select' | 'textarea' | 'readonly';

export interface ClientFieldConfig {
  /** Nome do control dentro do seu `FormGroup` (usado no rótulo e no `.get()`). */
  key: string;
  type?: ClientInputKind;
  options?: readonly string[];
  rows?: number;
  span?: 'full';
}

type FieldGroups = readonly (readonly ClientFieldConfig[])[];

export const CLIENT_FIELD_LABELS: Record<string, string> = {
  // NaturalPerson
  name: 'Nome',
  cpf: 'CPF',
  rg: 'RG',
  maritalStatus: 'Estado civil',
  occupation: 'Profissão',
  nationality: 'Nacionalidade',
  // LegalPerson
  legalName: 'Razão social',
  tradeName: 'Nome fantasia',
  cnpj: 'CNPJ',
  stateRegistration: 'Inscrição estadual',
  municipalRegistration: 'Inscrição municipal',
  // LegalRepresentative
  position: 'Cargo',
  // Address
  street: 'Endereço',
  number: 'Número',
  complement: 'Complemento',
  district: 'Bairro',
  state: 'UF',
  city: 'Cidade',
  zipCode: 'CEP',
  // Dossiê
  status: 'Status',
  hiringMode: 'Modalidade de contratação',
  folder: 'Pasta',
  file: 'Arquivo',
  registeredBy: 'Cadastrado por',
  contractNumber: 'Número do contrato',
  contractDate: 'Data do contrato',
  referredBy: 'Indicado por',
  internalOwner: 'Responsável interno',
  notes: 'Observações',
};

export const CLIENT_OPTION_LABELS: Record<string, string> = {
  // PersonType
  NATURAL: 'Pessoa física',
  LEGAL: 'Pessoa jurídica',
  // MaritalStatus
  SINGLE: 'Solteiro(a)',
  MARRIED: 'Casado(a)',
  DIVORCED: 'Divorciado(a)',
  WIDOWED: 'Viúvo(a)',
  STABLE_UNION: 'União estável',
  // ContactType
  PHONE: 'Telefone',
  WHATSAPP: 'WhatsApp',
  // ClientStatus
  active: 'Ativo',
  prospect: 'Prospect',
  inactive: 'Inativo',
  closed: 'Encerrado',
  // ClientHiringMode
  oneOff: 'Avulso',
  monthly: 'Mensalista',
  successFee: 'Êxito',
  advisory: 'Consultivo',
  litigation: 'Contencioso',
  mixed: 'Misto',
};

export const NATURAL_IDENTITY_FIELDS: FieldGroups = [
  [{ key: 'name' }, { key: 'cpf' }],
  [{ key: 'rg' }, { key: 'maritalStatus', type: 'select', options: MARITAL_STATUSES }],
  [{ key: 'occupation' }, { key: 'nationality' }],
];

export const LEGAL_IDENTITY_FIELDS: FieldGroups = [
  [{ key: 'legalName' }, { key: 'tradeName' }],
  [{ key: 'cnpj' }, { key: 'stateRegistration' }, { key: 'municipalRegistration' }],
];

export const REPRESENTATIVE_IDENTITY_FIELDS: FieldGroups = [
  [{ key: 'name' }, { key: 'cpf' }],
  [{ key: 'position' }],
];

export const ADDRESS_FIELDS: FieldGroups = [
  [{ key: 'street' }, { key: 'number' }],
  [{ key: 'complement' }, { key: 'district' }],
  [
    { key: 'state', type: 'select', options: BRAZILIAN_STATES },
    { key: 'city', type: 'select', options: CLIENT_CITIES },
    { key: 'zipCode' },
  ],
];

export const DOSSIER_FIELDS: FieldGroups = [
  [
    { key: 'status', type: 'select', options: CLIENT_STATUSES },
    { key: 'hiringMode', type: 'select', options: CLIENT_HIRING_MODES },
  ],
  [{ key: 'folder', type: 'readonly' }, { key: 'file' }],
  [{ key: 'registeredBy', type: 'readonly' }, { key: 'contractNumber' }, { key: 'contractDate' }],
  [{ key: 'referredBy' }, { key: 'internalOwner' }],
  [{ key: 'notes', type: 'textarea', rows: 4, span: 'full' }],
];
