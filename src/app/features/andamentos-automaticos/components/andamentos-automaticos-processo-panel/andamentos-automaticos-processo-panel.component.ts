import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { PanelLayoutSwitcherComponent } from '../../../../shared/components/panel-layout-switcher/panel-layout-switcher.component';
import { PAINEL_LAYOUT_PADRAO, PainelLayout } from '../../../../shared/models/panel-layout';

/**
 * Conteúdo do painel de Andamentos Automáticos — mesmo cabeçalho de `OperacoesProcessoPanelComponent`
 * (título + número CNJ, fechar e seletor de posição). O dono do `PanelShellController` é o
 * `app-processo-lista-painel`; este componente só recebe `layoutPainel`/emite `layoutPainelChange`.
 */
@Component({
  selector: 'app-andamentos-automaticos-processo-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PanelLayoutSwitcherComponent],
  templateUrl: './andamentos-automaticos-processo-panel.component.html',
  styleUrl: './andamentos-automaticos-processo-panel.component.scss',
})
export class AndamentosAutomaticosProcessoPanelComponent {
  readonly processoId = input.required<number>();
  readonly numeroCnj = input<string | null>(null);
  /** Posição atual do painel na tela (quem aplica/persiste é o `app-processo-lista-painel`). */
  readonly layoutPainel = input<PainelLayout>(PAINEL_LAYOUT_PADRAO);
  readonly layoutPainelChange = output<PainelLayout>();
  readonly fechar = output<void>();

  protected escolherLayout(layout: PainelLayout): void {
    this.layoutPainelChange.emit(layout);
  }

  protected onFechar(): void {
    this.fechar.emit();
  }
}
