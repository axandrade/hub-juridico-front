/** Ver backend `TipoOperacao`/migration V31. */
export type TipoOperacao = 'INTIMACAO' | 'TAREFA' | 'COMPROMISSO';

export const TIPO_OPERACAO_LABEL: Record<TipoOperacao, string> = {
  INTIMACAO: 'Intimação',
  TAREFA: 'Tarefa',
  COMPROMISSO: 'Compromisso',
};

/** Linha crua de `/domain/operacao` (camelCase) — ver backend `Operacao`/migration V31. */
export interface OperacaoRow {
  id: number;
  tipo: TipoOperacao;
  processoId: number;
  titulo: string | null;
  providencia: string | null;
  prazoFatal: string | null;
  status: string | null;
  criadoEm: string | null;
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
  data_evento: string | null;
  hora_evento: string | null;
  hora_prazo: string | null;
  origem: string | null;
  link: string | null;
  teor: string | null;
  providencia: string | null;
  responsavel_id: number | null;
  status: string;
}
