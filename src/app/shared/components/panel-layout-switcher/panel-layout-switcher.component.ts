import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { PainelLayout } from '../../models/panel-layout';

/**
 * Botões de ícone pra escolher a posição de um painel lateral (esquerda/abaixo/direita/diálogo).
 * Extraído do cabeçalho do painel de Clientes — reutilizado em qualquer tela com o mesmo padrão
 * "tabela + painel" (ver `PanelShellController`, que guarda o estado que este componente só
 * exibe/dispara).
 */
@Component({
  selector: 'app-panel-layout-switcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './panel-layout-switcher.component.html',
  styleUrl: './panel-layout-switcher.component.scss',
})
export class PanelLayoutSwitcherComponent {
  readonly layoutPainel = input.required<PainelLayout>();
  readonly layoutPainelChange = output<PainelLayout>();

  protected readonly opcoes: readonly PainelLayout[] = ['dialog', 'left', 'bottom', 'right'];

  protected escolher(layout: PainelLayout): void {
    this.layoutPainelChange.emit(layout);
  }

  protected rotulo(layout: PainelLayout): string {
    switch (layout) {
      case 'left':
        return 'Painel à esquerda';
      case 'right':
        return 'Painel à direita';
      case 'bottom':
        return 'Painel abaixo';
      case 'dialog':
        return 'Painel em diálogo';
    }
  }
}
