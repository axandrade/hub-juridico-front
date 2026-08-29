/**
 * Configuração de ambiente — desenvolvimento (padrão).
 * Só contém valores públicos. Nada de segredo aqui.
 * Em build de produção este arquivo é trocado por `environment.prod.ts`
 * (ver `angular.json > fileReplacements`).
 */
export const environment = {
  production: false,
  /** Base da API do hub-juridico-api (Django + DRF). */
  apiBaseUrl: 'http://localhost:8000/api/v1',
} as const;
