/**
 * Paleta de cores centralizada — Mood Botânico, Gentil, Artesanal.
 * Mantida em sincronia com `src/styles/_variables.scss` e as CSS custom
 * properties declaradas em `src/styles/_global.scss`.
 */
export const COLOR_PALETTE = {
  /** Contornos, títulos, destaque máximo, sidebar */
  BURGUNDY_DEEP: '#2B0F12',
  /** Botões primários, hover states, ênfase */
  ROUGE_DARK: '#8D2A3A',
  /** Elementos interativos, cards, headers */
  ROUGE_LIGHT: '#C85C5C',
  /** Backgrounds suaves, separadores, hover leve */
  PINK_PALE: '#E8B4B8',
  /** Fundo principal da aplicação */
  CREAM_WARM: '#F4F1DE',
} as const;

export const COLOR_SEMANTIC = {
  PRIMARY: COLOR_PALETTE.ROUGE_DARK,
  PRIMARY_LIGHT: COLOR_PALETTE.ROUGE_LIGHT,
  PRIMARY_PALE: COLOR_PALETTE.PINK_PALE,
  SECONDARY: COLOR_PALETTE.BURGUNDY_DEEP,
  BACKGROUND: COLOR_PALETTE.CREAM_WARM,
  SURFACE: '#FBFAF3',
  TEXT_PRIMARY: COLOR_PALETTE.BURGUNDY_DEEP,
  TEXT_SECONDARY: COLOR_PALETTE.ROUGE_DARK,
  BORDER: COLOR_PALETTE.PINK_PALE,
  SUCCESS: '#4CAF50',
  WARNING: '#FF9800',
  ERROR: COLOR_PALETTE.ROUGE_DARK,
  NEUTRAL_LIGHT: '#F9F7F4',
  OVERLAY: 'rgba(43, 15, 18, 0.1)',
} as const;

/** Sequência de cores para séries de gráficos, priorizando a paleta botânica. */
export const CHART_COLOR_SEQUENCE: readonly string[] = [
  COLOR_PALETTE.ROUGE_DARK,
  COLOR_PALETTE.ROUGE_LIGHT,
  COLOR_PALETTE.PINK_PALE,
  COLOR_PALETTE.BURGUNDY_DEEP,
  COLOR_SEMANTIC.SUCCESS,
  COLOR_SEMANTIC.WARNING,
];

export type ColorPaletteKey = keyof typeof COLOR_PALETTE;
export type ColorSemanticKey = keyof typeof COLOR_SEMANTIC;
