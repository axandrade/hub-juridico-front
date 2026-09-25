import { ChangeDetectionStrategy, Component } from '@angular/core';

import { ProcessoListaPainelComponent } from '../../shared/components/processo-lista-painel/processo-lista-painel.component';

/** Tela de Andamentos Automáticos — mesma lista de processos de Operações (`app-processo-lista-painel`), só que restrita a processos JUDICIAL (`filtroFixo`). */
@Component({
  selector: 'app-andamentos-automaticos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProcessoListaPainelComponent],
  templateUrl: './andamentos-automaticos.component.html',
})
export class AndamentosAutomaticosComponent {}
