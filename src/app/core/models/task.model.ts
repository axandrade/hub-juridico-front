export enum TaskStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  OVERDUE = 'overdue',
}

export interface ITask {
  id: string;
  title: string;
  category: string;
  dueDate: Date;
  status: TaskStatus;
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  [TaskStatus.PENDING]: 'Pendente',
  [TaskStatus.COMPLETED]: 'Concluída',
  [TaskStatus.OVERDUE]: 'Atrasada',
};
