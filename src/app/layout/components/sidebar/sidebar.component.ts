import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { APP_INFO, SIDEBAR_NAV } from '../../../core/constants/app-constants';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  private readonly auth = inject(AuthService);

  readonly collapsed = input<boolean>(false);
  readonly toggle = output<void>();

  protected readonly appInfo = APP_INFO;
  /** Itens `adminOnly` só entram para ADMIN. */
  protected readonly navItems = computed(() =>
    SIDEBAR_NAV.filter((item) => !item.adminOnly || this.auth.isAdmin()),
  );
}
