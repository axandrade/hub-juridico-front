import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';

import { APP_INFO, ROUTES } from '../../../../core/constants/app-constants';
import { extractApiErrorMessage } from '../../../../core/auth/auth.models';
import { cpfValidator } from '../../../../core/auth/cpf';
import { AuthService } from '../../../../core/services/auth.service';
import { CpfMaskDirective } from '../../../../shared/directives/cpf-mask.directive';

interface LegalMaxim {
  latin: string;
  pt: string;
}

/**
 * Tela de acesso do Hub Jurídico — autentica contra o hub-juridico-api
 * (`POST /auth/login/`). Em caso de `must_change_password`, o guard redireciona
 * o usuário para a troca de senha.
 */
@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, CpfMaskDirective],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly appInfo = APP_INFO;
  protected readonly year = new Date().getFullYear();

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showPassword = signal(false);
  protected readonly passwordChanged = signal(
    this.route.snapshot.queryParamMap.get('trocaOk') === '1',
  );

  protected readonly form = inject(FormBuilder).nonNullable.group({
    cpf: ['', [Validators.required, cpfValidator]],
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

  protected invalid(control: 'cpf' | 'password'): boolean {
    const field = this.form.controls[control];
    return field.invalid && (field.touched || field.dirty);
  }

  protected cpfError(): string {
    const field = this.form.controls.cpf;
    if (field.hasError('required')) {
      return 'Informe seu CPF.';
    }
    return field.hasError('cpf') ? 'CPF inválido.' : '';
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
    this.passwordChanged.set(false);

    const { cpf, password, remember } = this.form.getRawValue();

    this.auth
      .login(cpf, password, remember)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => {
          if (this.auth.mustChangePassword()) {
            void this.router.navigateByUrl(`/${ROUTES.CHANGE_PASSWORD}`);
            return;
          }
          const returnUrl =
            this.route.snapshot.queryParamMap.get('returnUrl') ?? `/${ROUTES.DASHBOARD}`;
          void this.router.navigateByUrl(returnUrl);
        },
        error: (err: unknown) =>
          this.error.set(extractApiErrorMessage(err, 'CPF ou senha inválidos.')),
      });
  }
}
