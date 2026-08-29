import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';

import { extractApiErrorMessage } from '../../../../core/auth/auth.models';
import {
  PASSWORD_MIN_LENGTH,
  passwordWeaknesses,
  passwordsMatchValidator,
  strongPasswordValidator,
} from '../../../../core/auth/password-policy';
import { APP_INFO, ROUTES } from '../../../../core/constants/app-constants';
import { AuthService } from '../../../../core/services/auth.service';

/**
 * Troca de senha obrigatória — exibida quando o back-end marca
 * `must_change_password`. Ao concluir, a sessão é encerrada e o usuário
 * reautentica com a nova senha.
 */
@Component({
  selector: 'app-change-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './change-password.component.html',
  styleUrl: './change-password.component.scss',
})
export class ChangePasswordComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly appInfo = APP_INFO;
  protected readonly year = new Date().getFullYear();
  protected readonly minLength = PASSWORD_MIN_LENGTH;

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly reveal = signal(false);

  protected readonly userName = computed(() => this.auth.user()?.nome ?? '');

  protected readonly form = inject(FormBuilder).nonNullable.group(
    {
      senhaAtual: ['', [Validators.required]],
      novaSenha: ['', [Validators.required, strongPasswordValidator]],
      confirmar: ['', [Validators.required]],
    },
    { validators: passwordsMatchValidator('novaSenha', 'confirmar') },
  );

  /** Requisitos de força ainda não atendidos pela nova senha. */
  private readonly weaknesses = signal<string[]>([]);

  /** Estado de cada requisito da política (para o checklist visual). */
  protected readonly checks = computed(() => {
    const missing = this.weaknesses();
    const met = (label: string) => !missing.includes(label);
    return {
      length: met(`ter ao menos ${PASSWORD_MIN_LENGTH} caracteres`),
      upper: met('uma letra maiúscula'),
      lower: met('uma letra minúscula'),
      digit: met('um número'),
      special: met('um caractere especial'),
    };
  });

  constructor() {
    this.form.controls.novaSenha.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.weaknesses.set(value ? passwordWeaknesses(value) : []);
    });
  }

  protected toggleReveal(): void {
    this.reveal.update((v) => !v);
  }

  protected showError(control: 'senhaAtual' | 'novaSenha' | 'confirmar'): boolean {
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

    const { senhaAtual, novaSenha } = this.form.getRawValue();

    this.auth
      .changePassword(senhaAtual, novaSenha)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => {
          void this.router.navigate([`/${ROUTES.LOGIN}`], { queryParams: { trocaOk: '1' } });
        },
        error: (err: unknown) => this.error.set(extractApiErrorMessage(err)),
      });
  }
}
