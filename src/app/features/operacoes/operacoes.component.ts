import { ChangeDetectionStrategy, Component } from '@angular/core';

import { ProcessoListaPainelComponent } from '../../shared/components/processo-lista-painel/processo-lista-painel.component';
import { OperacoesProcessoPanelComponent } from './components/operacoes-processo-panel/operacoes-processo-panel.component';

/**
 * Tela de Operações — a lista de processos com painel é a compartilhada
 * (`app-processo-lista-painel`, também usada por Andamentos Automáticos); aqui só entra o
 * conteúdo do painel: as operações do processo selecionado.
 */
@Component({
  selector: 'app-operacoes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProcessoListaPainelComponent, OperacoesProcessoPanelComponent],
  templateUrl: './operacoes.component.html',
})
export class OperacoesComponent {}
