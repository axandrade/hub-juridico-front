import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-advogado',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './advogado.component.html',
  styleUrl: './advogado.component.scss',
})
export class AdvogadoComponent {}
