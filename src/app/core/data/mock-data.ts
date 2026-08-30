import {
  CommitmentStatus,
  IClient,
  ICommitment,
  IProcess,
  ITask,
  ProcessStatus,
  TaskStatus,
  emptyAddress,
  emptyLegalPerson,
  emptyNaturalPerson,
} from '../models';

/** Cria uma data no fuso local (evita o deslocamento de dia do parser ISO/UTC). */
const d = (year: number, month: number, day: number): Date => new Date(year, month - 1, day);

/** Dados estáticos de demonstração — refletem o protótipo "Resumo geral". */

export const MOCK_TASKS: ITask[] = [
  {
    id: 't-1',
    title: 'Fazer cálculos - INSS - atrasados',
    category: 'Cálculos',
    dueDate: d(2026, 9, 15),
    status: TaskStatus.OVERDUE,
  },
  {
    id: 't-2',
    title: 'Petição inicial DONA AILA',
    category: 'Petições',
    dueDate: d(2026, 8, 9),
    status: TaskStatus.PENDING,
  },
  {
    id: 't-3',
    title: 'Revisar contrato de honorários',
    category: 'Contratos',
    dueDate: d(2026, 9, 2),
    status: TaskStatus.PENDING,
  },
  {
    id: 't-4',
    title: 'Protocolar recurso ordinário',
    category: 'Recursos',
    dueDate: d(2026, 7, 28),
    status: TaskStatus.COMPLETED,
  },
];

export const MOCK_COMMITMENTS: ICommitment[] = [
  {
    id: 'c-1',
    description: 'Audiência virtual de conciliação',
    date: d(2026, 8, 25),
    category: 'Audiência',
    status: CommitmentStatus.OVERDUE,
  },
  {
    id: 'c-2',
    description: 'Fazer balcão virtual - pedir análise da liminar e da revelia',
    date: d(2026, 8, 19),
    category: 'Balcão virtual',
    status: CommitmentStatus.OVERDUE,
  },
  {
    id: 'c-3',
    description: 'Lembrar de pedir na audiência instrução de prova testemunhal',
    date: d(2026, 8, 25),
    category: 'Audiência',
    status: CommitmentStatus.OVERDUE,
  },
  {
    id: 'c-4',
    description:
      'Verificar se está no prazo de réplica, conforme despacho de citação id. 214161459',
    date: d(2026, 8, 26),
    category: 'Prazo',
    status: CommitmentStatus.PENDING,
  },
];

export const MOCK_PROCESSES: IProcess[] = [
  {
    id: 'p-1',
    number: '0801234-56.2026.8.24.0001',
    type: 'Judicial',
    status: ProcessStatus.ACTIVE,
    court: 'TJCE',
  },
  {
    id: 'p-2',
    number: '0009876-54.2026.5.07.0002',
    type: 'Judicial',
    status: ProcessStatus.ACTIVE,
    court: 'TRT-7',
  },
  {
    id: 'p-3',
    number: '1002345-67.2026.4.05.8100',
    type: 'Judicial',
    status: ProcessStatus.ACTIVE,
    court: 'JFCE',
  },
  {
    id: 'p-4',
    number: '0806666-77.2025.8.24.0023',
    type: 'Administrativo',
    status: ProcessStatus.INACTIVE,
    court: 'INSS',
  },
];

export const MOCK_CLIENTS: IClient[] = [
  {
    id: 1,
    registeredAt: d(2026, 8, 21),
    favorite: true,
    personType: 'NATURAL',
    address: {
      street: 'Rua das Flores',
      number: '120',
      complement: 'Casa 2',
      district: 'Aldeota',
      city: 'Fortaleza',
      state: 'CE',
      zipCode: '60115-000',
    },
    emails: [
      { address: 'aila.santos@email.com', primary: true },
      { address: 'aila.trabalho@email.com', primary: false },
    ],
    contacts: [
      { value: '(85) 99999-0101', type: 'WHATSAPP', primary: true },
      { value: '(85) 98888-0101', type: 'PHONE', primary: false },
    ],
    naturalPerson: {
      name: 'AILA MARIA DOS SANTOS',
      cpf: '123.456.789-10',
      rg: '200100200',
      occupation: 'Costureira',
      nationality: 'Brasileira',
      maritalStatus: 'SINGLE',
    },
    legalPerson: emptyLegalPerson(),
    dossier: {
      folder: 'Pasta - 000001 - AILA MARIA DOS SANTOS',
      file: 'cadastro-aila-maria.pdf',
      status: 'active',
      hiringMode: 'successFee',
      contractNumber: '001/2026',
      contractDate: '21/08/2026',
      referredBy: 'Indicação familiar',
      internalOwner: 'Lincoln',
      registeredBy: 'Lincoln',
      notes:
        'Cliente com demanda previdenciária e histórico documental organizado.\n' +
        'Priorizar conferência de documentos pessoais antes de protocolar.',
      progressEntry: '',
      progressHistory: '21/08/2026 (09:45) | Cadastro criado e pasta inicial conferida.',
    },
  },
  {
    id: 2,
    registeredAt: d(2026, 8, 18),
    favorite: false,
    personType: 'NATURAL',
    address: {
      street: 'Avenida Central',
      number: '840',
      complement: 'Apto 402',
      district: 'Centro',
      city: 'Fortaleza',
      state: 'CE',
      zipCode: '60000-000',
    },
    emails: [{ address: 'carlos.lima@email.com', primary: true }],
    contacts: [{ value: '(85) 98888-0202', type: 'WHATSAPP', primary: true }],
    naturalPerson: {
      name: 'CARLOS HENRIQUE LIMA',
      cpf: '987.654.321-00',
      rg: '99008877',
      occupation: 'Motorista',
      nationality: 'Brasileira',
      maritalStatus: 'MARRIED',
    },
    legalPerson: emptyLegalPerson(),
    dossier: {
      folder: 'Pasta - 000002 - CARLOS HENRIQUE LIMA',
      file: '',
      status: 'prospect',
      hiringMode: 'oneOff',
      contractNumber: '',
      contractDate: '',
      referredBy: 'Instagram',
      internalOwner: 'Lincoln',
      registeredBy: 'Lincoln',
      notes: 'Prospect aguardando retorno sobre contrato de honorários.\nEnviar proposta revisada.',
      progressEntry: '',
      progressHistory: '18/08/2026 (14:10) | Primeiro contato registrado pelo atendimento.',
    },
  },
  {
    id: 3,
    registeredAt: d(2026, 8, 12),
    favorite: false,
    personType: 'LEGAL',
    address: {
      street: 'Rua do Comércio',
      number: '455',
      complement: 'Sala 08',
      district: 'Meireles',
      city: 'Fortaleza',
      state: 'CE',
      zipCode: '60160-000',
    },
    emails: [
      { address: 'juridico@flordeliz.com.br', primary: true },
      { address: 'financeiro@flordeliz.com.br', primary: false },
    ],
    contacts: [
      { value: '(85) 3777-0303', type: 'PHONE', primary: true },
      { value: '(85) 98888-0303', type: 'WHATSAPP', primary: false },
    ],
    naturalPerson: emptyNaturalPerson(),
    legalPerson: {
      legalName: 'FLOR DE LIZ COMÉRCIO LTDA',
      tradeName: 'FLOR DE LIZ',
      cnpj: '12.345.678/0001-90',
      stateRegistration: 'ISENTO',
      municipalRegistration: '445566',
      representatives: [
        {
          name: 'MARIANA LIZ BARBOSA',
          cpf: '321.654.987-11',
          position: 'Sócia administradora',
          address: emptyAddress(),
          emails: [{ address: 'mariana@flordeliz.com.br', primary: true }],
          contacts: [{ value: '(85) 99999-0303', type: 'WHATSAPP', primary: true }],
        },
        {
          name: 'João Sales',
          cpf: '111.222.333-44',
          position: 'Gerente',
          address: emptyAddress(),
          emails: [{ address: 'joao@flordeliz.com.br', primary: true }],
          contacts: [{ value: '(85) 98888-0404', type: 'WHATSAPP', primary: true }],
        },
      ],
    },
    dossier: {
      folder: 'Pasta - 000003 - FLOR DE LIZ COMÉRCIO LTDA',
      file: 'contrato-flor-de-liz.docx',
      status: 'active',
      hiringMode: 'monthly',
      contractNumber: '003/2026',
      contractDate: '12/08/2026',
      referredBy: 'Cliente antigo',
      internalOwner: 'Lincoln',
      registeredBy: 'Lincoln',
      notes:
        'Empresa com contratos recorrentes de consultivo e contencioso.\n' +
        'Revisar procuração atualizada antes da próxima distribuição.',
      progressEntry: '',
      progressHistory: '12/08/2026 (11:20) | Cadastro migrado para o módulo Clientes.',
    },
  },
];

export const MOCK_CONTEXT = {
  contextLabel: 'Particular',
  userName: 'Lincoln',
} as const;
