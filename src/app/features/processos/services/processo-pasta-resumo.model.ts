/**
 * Resumo da pasta de arquivos de um processo, dentro da árvore de um magistrado — uma linha da
 * tabela de visão geral do diálogo "Pasta do magistrado" (`GET
 * /api/v1/magistrados/{id}/pastas-magistrado/processos`, `ProcessoPastaResumoResponse` no
 * backend). JSON snake_case (ver `JacksonConfig`). Mesmo formato de `ClientePastaResumo`, trocando
 * "cliente" por "processo".
 */

export interface ProcessoPastaResumoApi {
  processo_id: number;
  numero_processo: string;
  pasta_id: string | null;
  qtd_pastas: number;
  qtd_documentos: number;
  tamanho_total_bytes: number;
  ultimo_envio_em: string | null;
}

export interface ProcessoPastaResumo {
  processoId: number;
  numeroProcesso: string;
  pastaId: string | null;
  qtdPastas: number;
  qtdDocumentos: number;
  tamanhoTotalBytes: number;
  ultimoEnvioEm: Date | null;
}

export function processoPastaResumoFromApi(api: ProcessoPastaResumoApi): ProcessoPastaResumo {
  return {
    processoId: api.processo_id,
    numeroProcesso: api.numero_processo,
    pastaId: api.pasta_id,
    qtdPastas: api.qtd_pastas,
    qtdDocumentos: api.qtd_documentos,
    tamanhoTotalBytes: api.tamanho_total_bytes,
    ultimoEnvioEm: api.ultimo_envio_em ? new Date(api.ultimo_envio_em) : null,
  };
}
