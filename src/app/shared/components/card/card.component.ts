import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { ButtonComponent } from '../button/button.component';

/**
 * Card genérico do painel — fundo creme com borda rosa pálido.
 * Reproduz o cabeçalho ":: Título ... Editar → x" do protótipo.
 */
@Component({
  selector: 'app-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent],
  templateUrl: './card.component.html',
  styleUrl: './card.component.scss',
})
export class CardComponent {
  readonly title = input<string>('');
  readonly icon = input<string>('');
  readonly backgroundColor = input<string>('var(--color-surface)');
  readonly borderColor = input<string>('var(--color-pink-pale)');

  /** Exibe o botão "Editar" / seta de navegação no cabeçalho. */
  readonly showEdit = input<boolean>(true);
  /** Exibe o botão de fechar/remover o card. */
  readonly showClose = input<boolean>(true);
  readonly loading = input<boolean>(false);

  readonly edit = output<void>();
  readonly navigate = output<void>();
  readonly close = output<void>();
}
