/** Ver backend `TipoOperacao`/migration V31. */
export type TipoOperacao = 'INTIMACAO' | 'TAREFA' | 'COMPROMISSO';

export const TIPO_OPERACAO_LABEL: Record<TipoOperacao, string> = {
  INTIMACAO: 'Intimação',
  TAREFA: 'Tarefa',
  COMPROMISSO: 'Compromisso',
};

/** Ver backend `StatusOperacao`/migration V31. */
export type StatusOperacao = 'CUMPRIDO' | 'NAO_CUMPRIDO' | 'PENDENTE' | 'ATRASADO';

export const STATUS_OPERACAO_LABEL: Record<StatusOperacao, string> = {
  CUMPRIDO: 'Cumprido',
  NAO_CUMPRIDO: 'Não cumprido',
  PENDENTE: 'Pendente',
  ATRASADO: 'Atrasado',
};

/** Ver backend `OrigemOperacao`/migration V31. Só `TipoOperacao.INTIMACAO` usa este campo. */
export type OrigemOperacao =
  | 'CADASTRO_MANUAL'
  | 'ANDAMENTO_AUTOMATICO'
  | 'DIARIO'
  | 'EMAIL'
  | 'TELEFONE_WHATSAPP'
  | 'SISTEMA_EXTERNO';

export const ORIGEM_OPERACAO_LABEL: Record<OrigemOperacao, string> = {
  CADASTRO_MANUAL: 'Cadastro manual',
  ANDAMENTO_AUTOMATICO: 'Andamento automático',
  DIARIO: 'Diário',
  EMAIL: 'Email',
  TELEFONE_WHATSAPP: 'Telefone/WhatsApp',
  SISTEMA_EXTERNO: 'Sistema externo',
};

/** Linha crua de `/domain/operacao` (camelCase) — ver backend `Operacao`/migration V31. */
export interface OperacaoRow {
  id: number;
  tipo: TipoOperacao;
  processoId: number;
  titulo: string | null;
  providencia: string | null;
  prazoFatal: string | null;
  status: StatusOperacao | null;
  criadoEm: string | null;
}

/** Ficha completa de `/domain/operacao/{id}` — usada pelo formulário pra carregar uma edição. */
export interface OperacaoDetalheRow {
  id: number;
  tipo: TipoOperacao;
  processoId: number;
  titulo: string | null;
  prazoFatal: string | null;
  horaInicio: string | null;
  horaFim: string | null;
  importancia: string | null;
  horaPrazo: string | null;
  origem: OrigemOperacao | null;
  link: string | null;
  teor: string | null;
  providencia: string | null;
  responsavelId: number | null;
  status: StatusOperacao | null;
}

/**
 * Corpo de `POST /domain/operacao` — snake_case (ver `DomainService`, escrita vai direto no bean
 * JPA via `ObjectMapper.readerForUpdating`, respeita o `PropertyNamingStrategy`). Campos que não
 * se aplicam ao `tipo` escolhido vão `null` (mesma tabela pros 3 tipos, ver `Operacao`).
 */
export interface OperacaoWriteApi {
  tipo: TipoOperacao;
  processo_id: number;
  titulo: string;
  prazo_fatal: string | null;
  hora_inicio: string | null;
  hora_fim: string | null;
  importancia: string | null;
  hora_prazo: string | null;
  origem: OrigemOperacao | null;
  link: string | null;
  teor: string | null;
  providencia: string | null;
  responsavel_id: number | null;
  status: StatusOperacao;
}
