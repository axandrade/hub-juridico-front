import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Botão genérico da paleta botânica.
 * - primary   → Rouge Escuro (#8D2A3A)
 * - secondary → Burgundy Profundo (#2B0F12)
 * - tertiary  → Rosa Pálido (#E8B4B8)
 */
@Component({
  selector: 'app-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './button.component.scss',
  template: `
    <button
      [type]="nativeType()"
      [class]="classes()"
      [disabled]="disabled()"
      [attr.aria-label]="ariaLabel() || label() || null"
      (click)="handleClick($event)"
    >
      @if (icon()) {
        <i [class]="icon()" aria-hidden="true"></i>
      }
      @if (label()) {
        <span>{{ label() }}</span>
      }
      <ng-content />
    </button>
  `,
})
export class ButtonComponent {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
  readonly icon = input<string>('');
  readonly label = input<string>('');
  readonly disabled = input<boolean>(false);
  readonly block = input<boolean>(false);
  readonly nativeType = input<'button' | 'submit' | 'reset'>('button');
  readonly ariaLabel = input<string>('');

  readonly clicked = output<MouseEvent>();

  protected readonly classes = computed(() =>
    [
      'btn',
      `btn--${this.variant()}`,
      `btn--${this.size()}`,
      this.block() ? 'btn--block' : '',
    ]
      .filter(Boolean)
      .join(' '),
  );

  protected handleClick(event: MouseEvent): void {
    if (this.disabled()) {
      return;
    }
    this.clicked.emit(event);
  }
}
