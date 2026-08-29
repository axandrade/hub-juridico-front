/**
 * Configuração de ambiente — produção.
 * A API é servida sob o mesmo domínio (reverse proxy), por isso o caminho relativo.
 * Ajuste `apiBaseUrl` se o back-end ficar em outro host — sempre via HTTPS.
 */
export const environment = {
  production: true,
  apiBaseUrl: '/api/v1',
} as const;
