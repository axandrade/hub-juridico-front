import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Tela de Operações — placeholder inicial (item "Operações" da sidebar). */
@Component({
  selector: 'app-operacoes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './operacoes.component.html',
  styleUrl: './operacoes.component.scss',
})
export class OperacoesComponent {}
