import {
  CommitmentStatus,
  IClient,
  ICommitment,
  IProcess,
  ITask,
  ProcessStatus,
  TaskStatus,
  emptyEndereco,
  emptyPessoa,
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
    pessoa: {
      ...emptyPessoa('FISICA'),
      nome: 'AILA MARIA DOS SANTOS',
      cpf: '123.456.789-10',
      rg: '200100200',
      profissao: 'Costureira',
      nacionalidade: 'Brasileira',
      estadoCivil: 'SOLTEIRO',
      endereco: {
        logradouro: 'Rua das Flores',
        numero: '120',
        complemento: 'Casa 2',
        bairro: 'Aldeota',
        cidade: 'Fortaleza',
        cep: '60115-000',
        uf: 'CE',
      },
      emails: [
        { endereco: 'aila.santos@email.com', principal: true },
        { endereco: 'aila.trabalho@email.com', principal: false },
      ],
      contatos: [
        { valor: '(85) 99999-0101', tipo: 'WHATSAPP', principal: true },
        { valor: '(85) 98888-0101', tipo: 'TELEFONE', principal: false },
      ],
    },
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
    pessoa: {
      ...emptyPessoa('FISICA'),
      nome: 'CARLOS HENRIQUE LIMA',
      cpf: '987.654.321-00',
      rg: '99008877',
      profissao: 'Motorista',
      nacionalidade: 'Brasileira',
      estadoCivil: 'CASADO',
      endereco: {
        logradouro: 'Avenida Central',
        numero: '840',
        complemento: 'Apto 402',
        bairro: 'Centro',
        cidade: 'Fortaleza',
        cep: '60000-000',
        uf: 'CE',
      },
      emails: [{ endereco: 'carlos.lima@email.com', principal: true }],
      contatos: [{ valor: '(85) 98888-0202', tipo: 'WHATSAPP', principal: true }],
    },
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
    pessoa: {
      ...emptyPessoa('JURIDICA'),
      razaoSocial: 'FLOR DE LIZ COMÉRCIO LTDA',
      nomeFantasia: 'FLOR DE LIZ',
      cnpj: '12.345.678/0001-90',
      inscricaoEstadual: 'ISENTO',
      inscricaoMunicipal: '445566',
      endereco: {
        logradouro: 'Rua do Comércio',
        numero: '455',
        complemento: 'Sala 08',
        bairro: 'Meireles',
        cidade: 'Fortaleza',
        cep: '60160-000',
        uf: 'CE',
      },
      emails: [
        { endereco: 'juridico@flordeliz.com.br', principal: true },
        { endereco: 'financeiro@flordeliz.com.br', principal: false },
      ],
      contatos: [
        { valor: '(85) 3777-0303', tipo: 'TELEFONE', principal: true },
        { valor: '(85) 98888-0303', tipo: 'WHATSAPP', principal: false },
      ],
      representantes: [
        {
          nome: 'MARIANA LIZ BARBOSA',
          cpf: '321.654.987-11',
          cargo: 'Sócia administradora',
          endereco: emptyEndereco(),
          emails: [{ endereco: 'mariana@flordeliz.com.br', principal: true }],
          contatos: [{ valor: '(85) 99999-0303', tipo: 'WHATSAPP', principal: true }],
        },
        {
          nome: 'João Sales',
          cpf: '111.222.333-44',
          cargo: 'Gerente',
          endereco: emptyEndereco(),
          emails: [{ endereco: 'joao@flordeliz.com.br', principal: true }],
          contatos: [{ valor: '(85) 98888-0404', tipo: 'WHATSAPP', principal: true }],
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
  {
    id: 4,
    registeredAt: d(2026, 8, 26),
    favorite: true,
    pessoa: {
      ...emptyPessoa('JURIDICA'),
      razaoSocial: 'ARARIPE ENGENHARIA E SERVIÇOS S/A',
      nomeFantasia: 'ARARIPE ENGENHARIA',
      cnpj: '98.765.432/0001-21',
      inscricaoEstadual: '06.987.654-3',
      inscricaoMunicipal: '778899',
      endereco: {
        logradouro: 'Avenida Washington Soares',
        numero: '1200',
        complemento: 'Torre B, 9º andar',
        bairro: 'Edson Queiroz',
        cidade: 'Fortaleza',
        cep: '60811-341',
        uf: 'CE',
      },
      emails: [
        { endereco: 'contato@araripeengenharia.com.br', principal: true },
        { endereco: 'juridico@araripeengenharia.com.br', principal: false },
      ],
      contatos: [
        { valor: '(85) 3266-4400', tipo: 'TELEFONE', principal: true },
        { valor: '(85) 99777-4400', tipo: 'WHATSAPP', principal: false },
      ],
      representantes: [
        {
          nome: 'ROBERTO ARARIPE FILHO',
          cpf: '654.321.987-00',
          cargo: 'Diretor-presidente',
          endereco: emptyEndereco(),
          emails: [{ endereco: 'roberto.araripe@araripeengenharia.com.br', principal: true }],
          contatos: [{ valor: '(85) 99666-1010', tipo: 'WHATSAPP', principal: true }],
        },
      ],
    },
    dossier: {
      folder: 'Pasta - 000004 - ARARIPE ENGENHARIA E SERVIÇOS S/A',
      file: 'contrato-araripe-engenharia.pdf',
      status: 'active',
      hiringMode: 'advisory',
      contractNumber: '004/2026',
      contractDate: '26/08/2026',
      referredBy: 'Indicação de parceiro',
      internalOwner: 'Lincoln',
      registeredBy: 'Lincoln',
      notes:
        'Contrato de consultoria societária e trabalhista com renovação anual.\n' +
        'Acompanhar due diligence de aquisição prevista para o próximo trimestre.',
      progressEntry: '',
      progressHistory: '26/08/2026 (16:30) | Cadastro criado após reunião de onboarding.',
    },
  },
];

export const MOCK_CONTEXT = {
  contextLabel: 'Particular',
  userName: 'Lincoln',
} as const;
