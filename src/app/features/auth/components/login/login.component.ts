import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';

import { APP_INFO, AUTH_DEMO, ROUTES } from '../../../../core/constants/app-constants';
import { AuthService } from '../../../../core/services/auth.service';

interface LegalMaxim {
  latin: string;
  pt: string;
}

/**
 * Tela de acesso do Hub Jurídico — identidade visual botânica com temática
 * de advocacia (balança da justiça, louro, máximas latinas).
 * Sem back-end: valida as credenciais de demonstração `admin` / `admin`.
 */
@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly appInfo = APP_INFO;
  protected readonly demo = AUTH_DEMO;
  protected readonly year = new Date().getFullYear();

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showPassword = signal(false);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    username: ['', [Validators.required]],
    password: ['', [Validators.required]],
    remember: [true],
  });

  private readonly maxims: readonly LegalMaxim[] = [
    { latin: 'Fiat justitia', pt: 'Faça-se justiça.' },
    { latin: 'Dura lex, sed lex', pt: 'A lei é dura, mas é a lei.' },
    { latin: 'Iustitia omnibus', pt: 'Justiça para todos.' },
    { latin: 'Audiatur et altera pars', pt: 'Ouça-se também a outra parte.' },
    { latin: 'In dubio pro reo', pt: 'Na dúvida, em favor do réu.' },
  ];
  private readonly maximIndex = signal(0);
  protected readonly maxim = computed(() => this.maxims[this.maximIndex()]);

  constructor() {
    const rotation = setInterval(() => {
      this.maximIndex.update((i) => (i + 1) % this.maxims.length);
    }, 6000);
    inject(DestroyRef).onDestroy(() => clearInterval(rotation));
  }

  protected togglePassword(): void {
    this.showPassword.update((value) => !value);
  }

  protected fillDemo(): void {
    this.form.setValue({
      username: AUTH_DEMO.USERNAME,
      password: AUTH_DEMO.PASSWORD,
      remember: true,
    });
    this.error.set(null);
  }

  protected invalid(control: 'username' | 'password'): boolean {
    const field = this.form.controls[control];
    return field.invalid && (field.touched || field.dirty);
  }

  protected submit(): void {
    if (this.loading()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    const { username, password, remember } = this.form.getRawValue();

    this.auth
      .login(username, password, remember)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => {
          const returnUrl =
            this.route.snapshot.queryParamMap.get('returnUrl') ?? `/${ROUTES.DASHBOARD}`;
          void this.router.navigateByUrl(returnUrl);
        },
        error: (err: Error) => this.error.set(err.message),
      });
  }
}
