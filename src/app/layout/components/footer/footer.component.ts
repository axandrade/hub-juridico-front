import { ChangeDetectionStrategy, Component } from '@angular/core';

import { APP_INFO } from '../../../core/constants/app-constants';

@Component({
  selector: 'app-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './footer.component.scss',
  template: `
    <footer class="footer">
      <span>{{ appInfo.NAME }} · v{{ appInfo.VERSION }}</span>
      <span>© {{ year }} — Gestão jurídica artesanal</span>
    </footer>
  `,
})
export class FooterComponent {
  protected readonly appInfo = APP_INFO;
  protected readonly year = new Date().getFullYear();
}
