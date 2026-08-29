/** Constantes de aplicação — rótulos, rotas e configurações compartilhadas. */

export const APP_INFO = {
  NAME: 'HUB Jurídico',
  TAGLINE: 'Gestão jurídica',
  VERSION: '1.0.0',
} as const;

export const ROUTES = {
  DASHBOARD: 'dashboard',
  LOGIN: 'login',
  CHANGE_PASSWORD: 'trocar-senha',
} as const;

export interface NavItem {
  label: string;
  icon: string;
  route?: string;
  badge?: string;
  emphasis?: 'primary' | 'accent' | 'neutral';
  action?: 'logout';
}

/** Itens de navegação da sidebar, refletindo o protótipo. */
export const SIDEBAR_NAV: readonly NavItem[] = [
  { label: 'Home', icon: 'fa-solid fa-house', route: `/${ROUTES.DASHBOARD}`, emphasis: 'primary' },
  { label: 'Notícias', icon: 'fa-solid fa-circle-exclamation', emphasis: 'accent' },
  { label: 'Agenda', icon: 'fa-solid fa-calendar-days', emphasis: 'accent' },
  { label: 'Tarefas', icon: 'fa-solid fa-square-check', emphasis: 'neutral' },
  { label: 'Compromissos', icon: 'fa-solid fa-clock', emphasis: 'neutral' },
  { label: 'Andamentos', icon: 'fa-solid fa-bell', emphasis: 'accent' },
  { label: 'Andamentos automáticos', icon: 'fa-solid fa-tower-broadcast', emphasis: 'accent' },
  { label: 'Clientes', icon: 'fa-solid fa-address-book', emphasis: 'neutral' },
  { label: 'Processos', icon: 'fa-solid fa-folder-open', emphasis: 'neutral' },
  { label: 'Petições', icon: 'fa-solid fa-file-lines', emphasis: 'neutral' },
  { label: 'Contratos', icon: 'fa-solid fa-file-signature', emphasis: 'neutral' },
  { label: 'Teses', icon: 'fa-solid fa-lightbulb', emphasis: 'neutral' },
  { label: 'Gestão de Decisões', icon: 'fa-solid fa-scale-balanced', emphasis: 'neutral' },
  { label: 'Análise Preditiva', icon: 'fa-solid fa-chart-column', emphasis: 'neutral' },
  { label: 'Advogados', icon: 'fa-solid fa-users', emphasis: 'neutral' },
  { label: 'Ferramentas', icon: 'fa-solid fa-screwdriver-wrench', emphasis: 'accent' },
  { label: 'Dashboard Jurídico', icon: 'fa-solid fa-chart-line', route: `/${ROUTES.DASHBOARD}`, emphasis: 'primary' },
  { label: 'Usuários', icon: 'fa-solid fa-user', emphasis: 'neutral' },
  { label: 'Configurações', icon: 'fa-solid fa-gear', emphasis: 'neutral' },
  { label: 'Sair', icon: 'fa-solid fa-right-from-bracket', emphasis: 'accent', action: 'logout' },
];

export const DATE_FORMAT = {
  SHORT: 'dd/MM/yyyy',
  LONG: 'dd/MM/yyyy HH:mm',
  LOCALE: 'pt-BR',
} as const;

export const CURRENCY = {
  CODE: 'BRL',
  LOCALE: 'pt-BR',
  SYMBOL: 'R$',
} as const;
