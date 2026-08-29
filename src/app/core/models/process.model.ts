export enum ProcessStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export interface IProcess {
  id: string;
  number: string;
  type: string;
  status: ProcessStatus;
  court?: string;
}

export const PROCESS_STATUS_LABEL: Record<ProcessStatus, string> = {
  [ProcessStatus.ACTIVE]: 'Ativo',
  [ProcessStatus.INACTIVE]: 'Inativo',
};
