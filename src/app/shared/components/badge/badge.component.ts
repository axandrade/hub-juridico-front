import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type BadgeTone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

/** Selo de status compacto, alinhado à paleta botânica. */
@Component({
  selector: 'app-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './badge.component.scss',
  template: `
    <span [class]="classes()">
      @if (dot()) {
        <span class="badge__dot" aria-hidden="true"></span>
      }
      <ng-content>{{ label() }}</ng-content>
    </span>
  `,
})
export class BadgeComponent {
  readonly label = input<string>('');
  readonly tone = input<BadgeTone>('neutral');
  readonly dot = input<boolean>(false);

  protected readonly classes = computed(() => `badge badge--${this.tone()}`);
}
