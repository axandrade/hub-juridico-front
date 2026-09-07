import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { AuthService } from '../../../core/services/auth.service';
import { PastaClienteService } from '../../../features/clients/services/pasta-cliente.service';
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

  readonly logout = output<void>();

  private readonly auth = inject(AuthService);
  private readonly pastaCliente = inject(PastaClienteService);

  protected readonly userName = computed(() => this.auth.user()?.name ?? '—');
  protected readonly userRole = computed(() => this.auth.user()?.role ?? '');
  protected readonly userEmail = computed(() => this.auth.user()?.email ?? '');
  /** Foto do usuário — `null` até o back expor; o template já cai nas iniciais. */
  protected readonly avatarUrl = computed(() => this.auth.user()?.avatar_url ?? null);
  protected readonly iniciais = computed(() => {
    const partes = (this.auth.user()?.name ?? '').trim().split(/\s+/).filter(Boolean);
    if (partes.length === 0) {
      return '?';
    }
    const primeira = partes[0][0];
    const ultima = partes.length > 1 ? partes[partes.length - 1][0] : '';
    return (primeira + ultima).toLocaleUpperCase('pt-BR');
  });

  protected readonly menuAberto = signal(false);

  protected readonly quickActions = [
    { label: 'Gerar arquivo', icon: 'fa-solid fa-file-export', variant: 'secondary' as const },
    { label: 'CAACE Intimações', icon: 'fa-solid fa-bell', variant: 'primary' as const },
    {
      label: 'Abrir pasta do processo',
      icon: 'fa-solid fa-folder-open',
      variant: 'tertiary' as const,
    },
  ];

  protected abrirPastaCliente(): void {
    this.pastaCliente.abrir();
  }

  protected alternarMenu(): void {
    this.menuAberto.update((v) => !v);
  }

  protected sair(): void {
    this.menuAberto.set(false);
    this.logout.emit();
  }

  @HostListener('document:click', ['$event'])
  protected aoClicarFora(event: MouseEvent): void {
    if (this.menuAberto() && !(event.target as HTMLElement | null)?.closest('.header__user-menu')) {
      this.menuAberto.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  protected aoPressionarEsc(): void {
    this.menuAberto.set(false);
  }
}
