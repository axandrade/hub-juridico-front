export const TIPOS_PESSOA = ['FISICA', 'JURIDICA'] as const;
/** Discriminador da hierarquia `com.hubjuridico.dominio.Pessoa` (tabelas `pessoas_fisicas` / `pessoas_juridicas`). */
export type TipoPessoa = (typeof TIPOS_PESSOA)[number];

export const STATUS_CLIENTE = ['active', 'inactive'] as const;
export type StatusCliente = (typeof STATUS_CLIENTE)[number];

export const MODALIDADES_CLIENTE = [
  'oneOff',
  'monthly',
  'successFee',
  'advisory',
  'litigation',
  'mixed',
] as const;
export type ModalidadeCliente = (typeof MODALIDADES_CLIENTE)[number];

/** Espelha `com.hubjuridico.dominio.enums.EstadoCivil`. */
export const ESTADOS_CIVIS = [
  'SOLTEIRO',
  'CASADO',
  'DIVORCIADO',
  'VIUVO',
  'UNIAO_ESTAVEL',
] as const;
export type EstadoCivil = (typeof ESTADOS_CIVIS)[number];

/** Espelha `com.hubjuridico.dominio.enums.TipoContato`. */
export const TIPOS_CONTATO = ['TELEFONE', 'WHATSAPP'] as const;
export type TipoContato = (typeof TIPOS_CONTATO)[number];

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

export const CIDADES_CLIENTE = ['Fortaleza', 'Juazeiro do Norte', 'Sobral'] as const;

/** Espelha `com.hubjuridico.dominio.Endereco` (embeddable, único por pessoa). */
export interface IEndereco {
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  cep: string;
  uf: string;
}

/** Espelha `com.hubjuridico.dominio.Email`. */
export interface IEmail {
  endereco: string;
  principal: boolean;
}

/** Espelha `com.hubjuridico.dominio.Contato`. */
export interface IContato {
  valor: string;
  tipo: TipoContato;
  principal: boolean;
}

/** Espelha `com.hubjuridico.dominio.RepresentanteLegal` (≈ mini-Pessoa). */
export interface IRepresentanteLegal {
  nome: string;
  cpf: string;
  cargo: string;
  endereco: IEndereco;
  emails: IEmail[];
  contatos: IContato[];
}

/**
 * Bloco de identidade da pessoa — física ou jurídica. Espelha a hierarquia
 * `com.hubjuridico.dominio.Pessoa` como um único objeto discriminado por `tipo`:
 * `endereco`/`emails`/`contatos` vêm da base `Pessoa`; os demais campos são de
 * `PessoaFisica` ou `PessoaJuridica` e só o bloco do `tipo` ativo é
 * preenchido/validado.
 */
export interface IDadosPessoa {
  tipo: TipoPessoa;
  // Pessoa (base)
  endereco: IEndereco;
  emails: IEmail[];
  contatos: IContato[];
  // PessoaFisica (+ `profissao`, extra do frontend)
  nome: string;
  cpf: string;
  rg: string;
  profissao: string;
  nacionalidade: string;
  estadoCivil: EstadoCivil | '';
  // PessoaJuridica
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  inscricaoEstadual: string;
  inscricaoMunicipal: string;
  representantes: IRepresentanteLegal[];
}

/**
 * Metadados do escritório sobre o cliente (pasta, contrato, andamento). Não têm
 * entidade no backend — vivem só no frontend por enquanto.
 */
export interface IDossie {
  folder: string;
  file: string;
  status: StatusCliente;
  hiringMode: ModalidadeCliente | '';
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
 * Uma `Pessoa` (física ou jurídica) do ponto de vista do frontend: o bloco de
 * identidade (`pessoa`) + o dossiê do escritório (`dossier`) + metadados do
 * registro. Corresponde ao agregado `com.hubjuridico.dominio.Pessoa`.
 */
export interface IPessoa {
  id: number;
  registeredAt: Date;
  favorite: boolean;
  pessoa: IDadosPessoa;
  dossier: IDossie;
}

export function emptyEndereco(): IEndereco {
  return {
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    cep: '',
    uf: '',
  };
}

export function emptyDadosPessoa(tipo: TipoPessoa = 'FISICA'): IDadosPessoa {
  return {
    tipo,
    endereco: emptyEndereco(),
    emails: [],
    contatos: [],
    nome: '',
    cpf: '',
    rg: '',
    profissao: '',
    nacionalidade: '',
    estadoCivil: '',
    razaoSocial: '',
    nomeFantasia: '',
    cnpj: '',
    inscricaoEstadual: '',
    inscricaoMunicipal: '',
    representantes: [],
  };
}

export function emptyDossie(): IDossie {
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

/** E-mail marcado como principal (ou o primeiro, ou vazio) — espelha `Pessoa.getEmailPrincipal()`. */
export function emailPrincipal(emails: readonly IEmail[]): string {
  return (emails.find((email) => email.principal) ?? emails[0])?.endereco ?? '';
}

/** Contato marcado como principal (ou o primeiro, ou vazio) — espelha `Pessoa.getContatoPrincipal()`. */
export function contatoPrincipal(contatos: readonly IContato[]): string {
  return (contatos.find((contato) => contato.principal) ?? contatos[0])?.valor ?? '';
}
