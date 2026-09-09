import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, debounceTime, distinctUntilChanged, skip, switchMap } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { maskCpf } from '../../core/auth/documentos-br';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { ModalComponent } from '../../shared/components/modal/modal.component';
import { DataTableComponent } from '../../shared/components/table/data-table.component';
import { TableColumn } from '../../shared/components/table/table-column.model';
import { TablePagination } from '../../shared/components/table/table.model';
import { USER_ROLE_LABEL, UsuarioApi } from './services/usuario-api.model';
import { UsuarioListQuery, UsuarioService } from './services/usuario-service';
import { UsuarioFormComponent } from './usuario-form/usuario-form.component';

/**
 * Tela de Usuários — só ADMIN (guard na rota + trava no back). Tabela paginada com busca livre
 * (nome / e-mail / CPF) e "mostrar inativos"; o cadastro/edição abre num `app-modal`
 * (`app-usuario-form`). Sem exclusão — só ativa/inativa.
 */
@Component({
  selector: 'app-usuario',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTableComponent, ButtonComponent, ModalComponent, UsuarioFormComponent],
  templateUrl: './usuario.component.html',
  styleUrl: './usuario.component.scss',
})
export class UsuarioComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly usuarioService = inject(UsuarioService);
  private readonly auth = inject(AuthService);

  /** Id do usuário logado — pra marcar "(você)" e evitar auto-inativação na UI. */
  protected readonly meuId = computed(() => this.auth.user()?.id ?? null);

  protected readonly modalAberto = signal(false);
  /** Id no modal; `null` = novo cadastro. */
  protected readonly selecionadoId = signal<number | null>(null);

  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  private readonly page = signal(0);
  private readonly reloadTick = signal(0);
  protected readonly incluirInativos = signal(false);
  protected readonly busca = signal('');

  protected readonly usuarios = this.usuarioService.usuarios;
  protected readonly total = this.usuarioService.totalElements;
  protected readonly pagination = computed<TablePagination>(() => ({
    page: this.usuarioService.page(),
    totalPages: this.usuarioService.totalPages(),
    totalElements: this.usuarioService.totalElements(),
    last: this.usuarioService.last(),
  }));

  protected readonly colunas: TableColumn<UsuarioApi>[] = [
    { key: 'name', header: 'Nome', width: '220px' },
    { key: 'email', header: 'E-mail', width: '240px' },
    {
      key: 'cpf',
      header: 'CPF',
      width: '150px',
      formatter: (value) => (value ? maskCpf(String(value)) : '-'),
    },
    {
      key: 'role',
      header: 'Papel',
      width: '140px',
      formatter: (value) => USER_ROLE_LABEL[String(value)] ?? String(value),
    },
    {
      key: 'last_login_at',
      header: 'Último acesso',
      width: '160px',
      formatter: (value) => (value ? new Date(String(value)).toLocaleString('pt-BR') : 'nunca'),
    },
    {
      key: 'ativo',
      header: 'Status',
      width: '110px',
      align: 'center',
      format: 'badge',
      badgeDot: true,
      formatter: (value) => (value ? 'Ativo' : 'Inativo'),
      badgeTone: (value) => (value ? 'success' : 'neutral'),
    },
  ];

  protected readonly rowClass = (row: UsuarioApi): Record<string, boolean> => ({
    'is-inactive': !row.ativo,
    'is-me': row.id === this.meuId(),
  });

  constructor() {
    const buscaDebounced = toSignal(
      toObservable(this.busca).pipe(debounceTime(300), distinctUntilChanged()),
      { initialValue: this.busca() },
    );
    toObservable(buscaDebounced)
      .pipe(skip(1), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.page.set(0));

    const query = computed<UsuarioListQuery & { tick: number }>(() => ({
      page: this.page(),
      busca: buscaDebounced(),
      incluirInativos: this.incluirInativos(),
      tick: this.reloadTick(),
    }));

    toObservable(query)
      .pipe(
        switchMap((q) => {
          this.loading.set(true);
          return this.usuarioService.carregar(q).pipe(
            catchError(() => {
              this.loading.set(false);
              this.loadError.set(true);
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.loading.set(false);
        this.loadError.set(false);
      });
  }

  protected onPageChange(page: number): void {
    this.page.set(page);
  }

  protected onBuscaInput(event: Event): void {
    this.busca.set((event.target as HTMLInputElement).value);
  }

  protected limparBusca(): void {
    this.busca.set('');
  }

  protected onToggleInativos(event: Event): void {
    this.incluirInativos.set((event.target as HTMLInputElement).checked);
    this.page.set(0);
  }

  protected reloadList(): void {
    this.loadError.set(false);
    this.reloadTick.update((t) => t + 1);
  }

  protected novoUsuario(): void {
    this.selecionadoId.set(null);
    this.modalAberto.set(true);
  }

  protected abrirUsuario(row: UsuarioApi): void {
    this.selecionadoId.set(row.id);
    this.modalAberto.set(true);
  }

  protected fecharModal(): void {
    this.modalAberto.set(false);
  }

  protected onSalvo(): void {
    this.reloadList();
    this.fecharModal();
  }

  protected onStatusAlterado(): void {
    this.reloadList();
  }
}
