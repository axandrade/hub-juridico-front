/** Posição de um painel lateral de detalhes/edição na tela (tabela + painel). */
export const PAINEL_LAYOUTS = ['left', 'right', 'bottom', 'dialog'] as const;

export type PainelLayout = (typeof PAINEL_LAYOUTS)[number];

export const PAINEL_LAYOUT_PADRAO: PainelLayout = 'left';

export function ehPainelLayout(valor: unknown): valor is PainelLayout {
  return typeof valor === 'string' && (PAINEL_LAYOUTS as readonly string[]).includes(valor);
}
