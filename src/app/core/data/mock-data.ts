import {
  CommitmentStatus,
  ICommitment,
  IProcess,
  ITask,
  ProcessStatus,
  TaskStatus,
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

export const MOCK_CONTEXT = {
  contextLabel: 'Particular',
  userName: 'Lincoln',
} as const;
