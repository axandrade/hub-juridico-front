/** Posição do painel do cliente na tela de clientes. */
export const PAINEL_LAYOUTS = ['left', 'right', 'bottom', 'dialog'] as const;

export type PainelLayout = (typeof PAINEL_LAYOUTS)[number];

export const PAINEL_LAYOUT_PADRAO: PainelLayout = 'left';

export function ehPainelLayout(valor: unknown): valor is PainelLayout {
  return typeof valor === 'string' && (PAINEL_LAYOUTS as readonly string[]).includes(valor);
}
