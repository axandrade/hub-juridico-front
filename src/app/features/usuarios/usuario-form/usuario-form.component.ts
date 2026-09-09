import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { onlyDigits } from '../../../core/auth/documentos-br';
import {
  passwordsMatchValidator,
  strongPasswordValidator,
  weakPasswordMessage,
} from '../../../core/auth/password-policy';
import { ButtonComponent } from '../../../shared/components/button/button.component';
import { CpfMaskDirective } from '../../../shared/directives/cpf-mask.directive';
import { UserRole, USER_ROLE_LABEL, UsuarioApi } from '../services/usuario-api.model';
import { UsuarioService } from '../services/usuario-service';

type NoticeKey = 'idle' | 'saving' | 'saveError' | 'requiredFields' | 'statusError' | 'senhaOk' | 'senhaError';

/**
 * Formulário de cadastro/edição de usuário — vive dentro do `app-modal` da tela de Usuários.
 * Criar: CPF + nome + e-mail + papel + senha inicial (o usuário troca no 1º login). Editar: nome
 * + e-mail + papel (CPF travado), + ativar/inativar e "redefinir senha".
 */
@Component({
  selector: 'app-usuario-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ButtonComponent, CpfMaskDirective],
  templateUrl: './usuario-form.component.html',
  styleUrl: './usuario-form.component.scss',
})
export class UsuarioFormComponent {
  private readonly usuarioService = inject(UsuarioService);

  readonly usuarioId = input<number | null>(null);
  /** Id do admin logado — trava a auto-inativação na UI (o back também barra). */
  readonly meuId = input<number | null>(null);

  readonly salvo = output<UsuarioApi>();
  readonly statusAlterado = output<UsuarioApi>();
  readonly cancelado = output<void>();

  protected readonly modoEdicao = computed(() => this.usuarioId() !== null);
  protected readonly roles: UserRole[] = ['USER', 'ADMIN'];
  protected readonly roleLabel = USER_ROLE_LABEL;

  protected readonly carregado = signal<UsuarioApi | null>(null);
  protected readonly notice = signal<NoticeKey>('idle');
  protected readonly noticeMsg = signal('');
  protected readonly confirmandoInativacao = signal(false);
  protected readonly resetAberto = signal(false);

  protected readonly form = new FormGroup(
    {
      cpf: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      email: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, Validators.email],
      }),
      role: new FormControl<UserRole>('USER', { nonNullable: true, validators: [Validators.required] }),
      senha: new FormControl('', { nonNullable: true, validators: [strongPasswordValidator] }),
      confirmarSenha: new FormControl('', { nonNullable: true }),
    },
    { validators: passwordsMatchValidator('senha', 'confirmarSenha') },
  );

  /** Form separado do reset de senha (edição). */
  protected readonly resetForm = new FormGroup(
    {
      senha: new FormControl('', { nonNullable: true, validators: [strongPasswordValidator] }),
      confirmarSenha: new FormControl('', { nonNullable: true }),
    },
    { validators: passwordsMatchValidator('senha', 'confirmarSenha') },
  );

  protected readonly ativo = computed(() => this.carregado()?.ativo ?? true);
  protected readonly ehEuMesmo = computed(
    () => this.carregado() !== null && this.carregado()!.id === this.meuId(),
  );

  constructor() {
    effect(() => {
      const id = this.usuarioId();
      untracked(() => {
        this.notice.set('idle');
        this.confirmandoInativacao.set(false);
        this.resetAberto.set(false);
        this.resetForm.reset();
        if (id === null) {
          this.form.reset({ role: 'USER' });
          this.form.controls.cpf.enable({ emitEvent: false });
          this.aplicarValidadoresSenha(true);
          this.carregado.set(null);
          return;
        }
        this.usuarioService.buscarCompleto(id).subscribe((u) => {
          if (!u) {
            return;
          }
          this.carregado.set(u);
          this.form.reset({
            cpf: u.cpf,
            name: u.name,
            email: u.email,
            role: (u.role === 'ADMIN' ? 'ADMIN' : 'USER') as UserRole,
          });
          this.form.controls.cpf.disable({ emitEvent: false });
          this.aplicarValidadoresSenha(false);
        });
      });
    });
  }

  /** No criar, senha/confirmação são obrigatórias; no editar, saem de cena. */
  private aplicarValidadoresSenha(criando: boolean): void {
    const { senha, confirmarSenha } = this.form.controls;
    senha.setValidators(criando ? [Validators.required, strongPasswordValidator] : []);
    confirmarSenha.setValidators(criando ? [Validators.required] : []);
    senha.updateValueAndValidity({ emitEvent: false });
    confirmarSenha.updateValueAndValidity({ emitEvent: false });
  }

  protected senhaErro(control: 'senha' | 'confirmarSenha', group: 'form' | 'resetForm'): string {
    const g = group === 'form' ? this.form : this.resetForm;
    const c = g.controls[control];
    if (control === 'senha' && c.touched && c.errors?.['weakPassword']) {
      return weakPasswordMessage(c.errors['weakPassword'].missing);
    }
    if (control === 'confirmarSenha' && c.touched && g.errors?.['passwordsMismatch']) {
      return 'As senhas não conferem.';
    }
    return '';
  }

  protected salvar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notice.set('requiredFields');
      return;
    }
    const raw = this.form.getRawValue();
    this.notice.set('saving');

    const id = this.usuarioId();
    const req$ =
      id === null
        ? this.usuarioService.criar({
            cpf: onlyDigits(raw.cpf),
            email: raw.email.trim(),
            name: raw.name.trim(),
            role: raw.role,
            senha: raw.senha,
          })
        : this.usuarioService.atualizar(id, {
            email: raw.email.trim(),
            name: raw.name.trim(),
            role: raw.role,
          });

    req$.subscribe({
      next: (u) => this.salvo.emit(u),
      error: (err: unknown) => {
        this.notice.set('saveError');
        this.noticeMsg.set(this.httpErro(err));
      },
    });
  }

  protected pedirInativacao(): void {
    this.confirmandoInativacao.set(true);
  }

  protected alternarStatus(ativo: boolean): void {
    const id = this.usuarioId();
    if (id === null) {
      return;
    }
    this.confirmandoInativacao.set(false);
    this.usuarioService.alterarStatus(id, ativo).subscribe({
      next: (u) => {
        this.carregado.set(u);
        this.statusAlterado.emit(u);
      },
      error: (err: unknown) => {
        this.notice.set('statusError');
        this.noticeMsg.set(this.httpErro(err));
      },
    });
  }

  protected confirmarReset(): void {
    const id = this.usuarioId();
    if (id === null || this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }
    this.usuarioService.redefinirSenha(id, this.resetForm.getRawValue().senha).subscribe({
      next: () => {
        this.notice.set('senhaOk');
        this.noticeMsg.set('Senha redefinida. O usuário deve trocá-la no próximo login.');
        this.resetAberto.set(false);
        this.resetForm.reset();
      },
      error: (err: unknown) => {
        this.notice.set('senhaError');
        this.noticeMsg.set(this.httpErro(err));
      },
    });
  }

  protected cancelar(): void {
    this.cancelado.emit();
  }

  private httpErro(err: unknown): string {
    const e = err as {
      error?: { detail?: string; title?: string; fields?: Record<string, string> };
      status?: number;
    };
    if (e?.status === 0) {
      return 'Sem conexão com o servidor.';
    }
    const fields = e?.error?.fields;
    if (fields && Object.keys(fields).length) {
      return Object.values(fields)[0];
    }
    return e?.error?.detail || e?.error?.title || 'Erro ao comunicar com o servidor.';
  }
}
