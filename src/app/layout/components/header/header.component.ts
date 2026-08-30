import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { MOCK_CONTEXT } from '../../../core/data/mock-data';
import { AuthService } from '../../../core/services/auth.service';
import { ButtonComponent } from '../../../shared/components/button/button.component';

@Component({
  selector: 'app-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent {
  readonly pageTitle = input<string>('Hub Jurídico');
  readonly pageSubtitle = input<string>('Resumo geral');

  private readonly auth = inject(AuthService);

  protected readonly context = MOCK_CONTEXT;
  protected readonly userName = computed(() => this.auth.user()?.name ?? '—');
  protected readonly userRole = computed(() => this.auth.user()?.role ?? '');

  protected readonly quickActions = [
    { label: 'Gerar arquivo', icon: 'fa-solid fa-file-export', variant: 'secondary' as const },
    { label: 'CAACE Intimações', icon: 'fa-solid fa-bell', variant: 'primary' as const },
    {
      label: 'Abrir pasta do processo',
      icon: 'fa-solid fa-folder-open',
      variant: 'tertiary' as const,
    },
    { label: 'Abrir pasta do cliente', icon: 'fa-solid fa-folder', variant: 'tertiary' as const },
  ];
}
