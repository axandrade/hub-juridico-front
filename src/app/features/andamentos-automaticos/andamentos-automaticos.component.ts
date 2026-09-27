import { ChangeDetectionStrategy, Component } from '@angular/core';

import { ProcessoListaPainelComponent } from '../../shared/components/processo-lista-painel/processo-lista-painel.component';
import { AndamentosAutomaticosProcessoPanelComponent } from './components/andamentos-automaticos-processo-panel/andamentos-automaticos-processo-panel.component';

/** Tela de Andamentos Automáticos — mesma lista de processos de Operações (`app-processo-lista-painel`), só que restrita a processos JUDICIAL (`filtroFixo`). */
@Component({
  selector: 'app-andamentos-automaticos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProcessoListaPainelComponent, AndamentosAutomaticosProcessoPanelComponent],
  templateUrl: './andamentos-automaticos.component.html',
})
export class AndamentosAutomaticosComponent {}
