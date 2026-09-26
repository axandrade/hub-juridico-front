import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

import { PanelLayoutSwitcherComponent } from '../../../../shared/components/panel-layout-switcher/panel-layout-switcher.component';
import { PAINEL_LAYOUT_PADRAO, PainelLayout } from '../../../../shared/models/panel-layout';
import { AndamentosListaAndamentosComponent } from '../andamentos-lista-andamentos/andamentos-lista-andamentos.component';
import { AndamentosListaPublicacoesComponent } from '../andamentos-lista-publicacoes/andamentos-lista-publicacoes.component';
import { AndamentosVisaoGeralComponent } from '../andamentos-visao-geral/andamentos-visao-geral.component';

type AndamentosAba = 'visaoGeral' | 'andamentos' | 'publicacoes';

/**
 * Conteúdo do painel de Andamentos Automáticos — mesmo cabeçalho de `OperacoesProcessoPanelComponent`
 * (título + número CNJ, fechar e seletor de posição), com as abas "Visão Geral", "Andamentos" e "Publicações" no
 * mesmo desenho das abas do cadastro de operação. O dono do `PanelShellController` é o
 * `app-processo-lista-painel`; este componente só recebe `layoutPainel`/emite `layoutPainelChange`.
 *
 * Cada aba é um componente próprio que recebe o `processoId` e carrega seus dados (padrão das abas
 * de Operação/Processo) — a consulta (DataJud + STF) é compartilhada entre elas pelo `AndamentosService`.
 */
@Component({
  selector: 'app-andamentos-automaticos-processo-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PanelLayoutSwitcherComponent,
    AndamentosVisaoGeralComponent,
    AndamentosListaAndamentosComponent,
    AndamentosListaPublicacoesComponent,
  ],
  templateUrl: './andamentos-automaticos-processo-panel.component.html',
  styleUrl: './andamentos-automaticos-processo-panel.component.scss',
})
export class AndamentosAutomaticosProcessoPanelComponent {
  readonly processoId = input.required<number>();
  readonly numeroCnj = input<string | null>(null);
  readonly clienteNome = input<string | null>(null);
  /** Posição atual do painel na tela (quem aplica/persiste é o `app-processo-lista-painel`). */
  readonly layoutPainel = input<PainelLayout>(PAINEL_LAYOUT_PADRAO);
  readonly layoutPainelChange = output<PainelLayout>();
  readonly fechar = output<void>();

  protected readonly abas: readonly AndamentosAba[] = ['visaoGeral', 'andamentos', 'publicacoes'];
  protected readonly abaAtiva = signal<AndamentosAba>('visaoGeral');

  protected trocarAba(aba: AndamentosAba): void {
    this.abaAtiva.set(aba);
  }

  protected escolherLayout(layout: PainelLayout): void {
    this.layoutPainelChange.emit(layout);
  }

  protected onFechar(): void {
    this.fechar.emit();
  }
}
