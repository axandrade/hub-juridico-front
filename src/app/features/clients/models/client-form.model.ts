import {
  BRAZILIAN_STATES,
  CLIENT_CITIES,
  CLIENT_HIRING_MODES,
  CLIENT_STATUSES,
  ESTADOS_CIVIS,
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
  // PessoaFisica
  nome: 'Nome',
  cpf: 'CPF',
  rg: 'RG',
  estadoCivil: 'Estado civil',
  profissao: 'Profissão',
  nacionalidade: 'Nacionalidade',
  // PessoaJuridica
  razaoSocial: 'Razão social',
  nomeFantasia: 'Nome fantasia',
  cnpj: 'CNPJ',
  inscricaoEstadual: 'Inscrição estadual',
  inscricaoMunicipal: 'Inscrição municipal',
  // RepresentanteLegal
  cargo: 'Cargo',
  // Endereco
  logradouro: 'Endereço',
  numero: 'Número',
  complemento: 'Complemento',
  bairro: 'Bairro',
  uf: 'UF',
  cidade: 'Cidade',
  cep: 'CEP',
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
  // TipoPessoa
  FISICA: 'Pessoa física',
  JURIDICA: 'Pessoa jurídica',
  // EstadoCivil
  SOLTEIRO: 'Solteiro(a)',
  CASADO: 'Casado(a)',
  DIVORCIADO: 'Divorciado(a)',
  VIUVO: 'Viúvo(a)',
  UNIAO_ESTAVEL: 'União estável',
  // TipoContato
  TELEFONE: 'Telefone',
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

export const PESSOA_FISICA_FIELDS: FieldGroups = [
  [{ key: 'nome' }, { key: 'cpf' }],
  [{ key: 'rg' }, { key: 'estadoCivil', type: 'select', options: ESTADOS_CIVIS }],
  [{ key: 'profissao' }, { key: 'nacionalidade' }],
];

export const PESSOA_JURIDICA_FIELDS: FieldGroups = [
  [{ key: 'razaoSocial' }, { key: 'nomeFantasia' }],
  [{ key: 'cnpj' }, { key: 'inscricaoEstadual' }, { key: 'inscricaoMunicipal' }],
];

export const REPRESENTANTE_FIELDS: FieldGroups = [
  [{ key: 'nome' }, { key: 'cpf' }],
  [{ key: 'cargo' }],
];

export const ENDERECO_FIELDS: FieldGroups = [
  [{ key: 'logradouro' }, { key: 'numero' }],
  [{ key: 'complemento' }, { key: 'bairro' }],
  [
    { key: 'uf', type: 'select', options: BRAZILIAN_STATES },
    { key: 'cidade', type: 'select', options: CLIENT_CITIES },
    { key: 'cep' },
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
