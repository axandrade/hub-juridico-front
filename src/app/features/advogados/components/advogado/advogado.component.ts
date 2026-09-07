import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, switchMap } from 'rxjs';

import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { DataTableComponent } from '../../../../shared/components/table/data-table.component';
import { TableColumn } from '../../../../shared/components/table/table-column.model';
import { TablePagination, TablePinAction } from '../../../../shared/components/table/table.model';
import { PanelShellController } from '../../../../shared/panel-shell/panel-shell.controller';
import { maskCpf } from '../../../../core/auth/cpf';
import { AdvogadoApi } from '../../services/advogado-api.model';
import { AdvogadoListQuery, AdvogadoStore } from '../../services/advogado-store';
import { AdvogadoFormComponent } from '../advogado-form/advogado-form.component';

/**
 * Tela de Advogados — mesmo conceito de "Clientes": tabela + painel lateral posicionável, e o
 * painel é um formulário de criar/editar (`app-advogado-form`). "Novo" abre o painel limpo;
 * clicar numa linha abre o advogado em edição. Posição do painel, redimensionamento e
 * mostrar/ocultar vêm do `PanelShellController` (ver o JSDoc dele).
 */
@Component({
  selector: 'app-advogado',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTableComponent, ButtonComponent, AdvogadoFormComponent],
  templateUrl: './advogado.component.html',
  styleUrl: './advogado.component.scss',
})
export class AdvogadoComponent {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly store = inject(AdvogadoStore);

  private readonly form = viewChild(AdvogadoFormComponent);

  protected readonly panelShell = new PanelShellController(this.document, {
    storagePrefix: 'hub-juridico.advogados',
    larguraPadrao: 380,
  });

  /** Id do advogado aberto no painel; `null` = cadastro novo. */
  protected readonly selectedId = signal<number | null>(null);
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);

  private readonly page = signal(0);
  private readonly reloadTick = signal(0);
  /** `true` traz também advogados inativos — reflete o `incluirInativos` real do backend. */
  protected readonly incluirInativos = signal(false);
  protected readonly columnFilterValues = signal<Record<string, string>>({});

  protected readonly advogados = this.store.advogados;
  protected readonly totalAdvogados = this.store.totalElements;
  protected readonly pagination = computed<TablePagination>(() => ({
    page: this.store.page(),
    totalPages: this.store.totalPages(),
    totalElements: this.store.totalElements(),
    last: this.store.last(),
  }));

  protected readonly advogadoColumns: TableColumn<AdvogadoApi>[] = [
    { key: 'nome', header: 'Nome', width: '220px', filter: { type: 'text' } },
    { key: 'oab', header: 'OAB', width: '150px', filter: { type: 'text' } },
    {
      key: 'cpf',
      header: 'CPF',
      width: '140px',
      formatter: (value) => (value ? maskCpf(String(value)) : '-'),
      filter: { type: 'text' },
    },
    { key: 'email', header: 'E-mail', width: '220px', filter: { type: 'text' } },
    { key: 'cidade_profissional', header: 'Cidade', width: '160px', filter: { type: 'text' } },
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

  protected readonly advogadoRowClass = (row: AdvogadoApi): Record<string, boolean> => ({
    'is-selected': this.selectedId() === row.id,
    'is-favorite': row.favorito,
    'is-inactive': !row.ativo,
  });

  protected readonly advogadoPinFirst = (row: AdvogadoApi): boolean => row.favorito;

  protected readonly advogadoPinAction: TablePinAction<AdvogadoApi> = {
    isActive: (row) => row.favorito,
    onToggle: (row, event) => this.toggleFavorito(row, event),
    ariaLabel: 'Favoritar advogado',
  };

  constructor() {
    const query = computed<AdvogadoListQuery & { tick: number }>(() => {
      const filtros = this.columnFilterValues();
      return {
        page: this.page(),
        nome: filtros['nome'],
        oab: filtros['oab'],
        cpf: filtros['cpf'],
        email: filtros['email'],
        cidadeProfissional: filtros['cidade_profissional'],
        incluirInativos: this.incluirInativos(),
        tick: this.reloadTick(),
      };
    });

    toObservable(query)
      .pipe(
        switchMap((q) => {
          this.loading.set(true);
          return this.store.carregar(q).pipe(
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

  protected onColumnFilterChange({ key, value }: { key: string; value: string }): void {
    this.columnFilterValues.update((atual) => {
      if (!value.trim()) {
        const { [key]: _removido, ...resto } = atual;
        return resto;
      }
      return { ...atual, [key]: value };
    });
    this.page.set(0);
  }

  protected onToggleIncluirInativos(event: Event): void {
    this.incluirInativos.set((event.target as HTMLInputElement).checked);
    this.page.set(0);
  }

  protected toggleFavorito(row: AdvogadoApi, event: MouseEvent): void {
    event.stopPropagation();
    this.store.alternarFavorito(row.id);
  }

  protected reloadList(): void {
    this.loadError.set(false);
    this.reloadTick.update((tick) => tick + 1);
  }

  private refreshList(): void {
    this.reloadTick.update((tick) => tick + 1);
  }

  /** Botão "Novo" — abre o painel limpo pra cadastrar (mesmo papel de `clients.newRecord`). */
  protected novoAdvogado(): void {
    this.selectedId.set(null);
    this.panelShell.setPanelVisible(true);
  }

  protected selectAdvogado(row: AdvogadoApi): void {
    const form = this.form();
    if (form?.locked() && this.selectedId() !== row.id) {
      form.notifyLockedSelection();
      return;
    }
    this.selectedId.set(row.id);
    this.panelShell.setPanelVisible(true);
  }

  protected onSaved(advogado: AdvogadoApi): void {
    this.selectedId.set(advogado.id);
    this.refreshList();
  }

  protected onStatusChanged(advogado: AdvogadoApi): void {
    this.selectedId.set(advogado.id);
    this.refreshList();
  }

  protected onCleared(): void {
    this.selectedId.set(null);
    this.refreshList();
  }

  /** No modo diálogo, Esc esconde o painel (mantém o advogado selecionado). */
  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.panelShell.layoutPainel() === 'dialog' && this.panelShell.panelVisible()) {
      this.panelShell.setPanelVisible(false);
    }
  }
}
