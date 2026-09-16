/**
 * Configuração de ambiente — desenvolvimento (padrão).
 * Só contém valores públicos. Nada de segredo aqui.
 * Em build de produção este arquivo é trocado por `environment.prod.ts`
 * (ver `angular.json > fileReplacements`).
 */
export const environment = {
  production: false,
  /** Base da API do hub-juridico-api (Spring Boot). */
  apiBaseUrl: 'http://localhost:8080/api/v1',
  /** Base do CRUD genérico do ddd-noap (`/domain/{entidade}`) — não fica sob `/api/v1`. */
  domainBaseUrl: 'http://localhost:8080/domain',
} as const;
