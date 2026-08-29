export enum CommitmentStatus {
  SCHEDULED = 'scheduled',
  PENDING = 'pending',
  OVERDUE = 'overdue',
}

export interface ICommitment {
  id: string;
  description: string;
  date: Date;
  category: string;
  status: CommitmentStatus;
}

export const COMMITMENT_STATUS_LABEL: Record<CommitmentStatus, string> = {
  [CommitmentStatus.SCHEDULED]: 'Agendado',
  [CommitmentStatus.PENDING]: 'Pendente',
  [CommitmentStatus.OVERDUE]: 'Atrasado',
};
