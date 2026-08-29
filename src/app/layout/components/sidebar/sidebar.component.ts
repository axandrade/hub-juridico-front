import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { APP_INFO, NavItem, SIDEBAR_NAV } from '../../../core/constants/app-constants';

@Component({
  selector: 'app-sidebar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  readonly collapsed = input<boolean>(false);
  readonly toggle = output<void>();

  protected readonly appInfo = APP_INFO;
  protected readonly navItems: readonly NavItem[] = SIDEBAR_NAV;
}
