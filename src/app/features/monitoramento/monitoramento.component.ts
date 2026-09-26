import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Tela de Monitoramento (antigo "Rastreamentos" do menu) — por ora só o esqueleto da página. */
@Component({
  selector: 'app-monitoramento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './monitoramento.component.html',
  styleUrl: './monitoramento.component.scss',
})
export class MonitoramentoComponent {}
