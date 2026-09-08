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
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, debounceTime, distinctUntilChanged, skip, switchMap } from 'rxjs';

import { ButtonComponent } from '../../shared/components/button/button.component';
import { DataTableComponent } from '../../shared/components/table/data-table.component';
import { TableColumn } from '../../shared/components/table/table-column.model';
import { TablePagination, TablePinAction } from '../../shared/components/table/table.model';
import { PanelShellController } from '../../shared/panel-shell/panel-shell.controller';
import { maskCpf } from '../../core/auth/documentos-br';
import { AdvogadoApi } from './services/advogado-api.model';
import { AdvogadoListQuery, AdvogadoService } from './services/advogado-service';
import { AdvogadoFormComponent } from './advogado-form/advogado-form.component';

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
  private readonly advogadoService = inject(AdvogadoService);

  private readonly form = viewChild(AdvogadoFormComponent);
  /** A grade — o botão "Colunas" da barra de ações comanda esta instância. */
  protected readonly grade = viewChild(DataTableComponent);

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
  /** Busca livre (nome / OAB / e-mail / CPF) — resolvida no servidor, com debounce. */
  protected readonly busca = signal('');

  protected readonly advogados = this.advogadoService.advogados;
  protected readonly totalAdvogados = this.advogadoService.totalElements;
  protected readonly pagination = computed<TablePagination>(() => ({
    page: this.advogadoService.page(),
    totalPages: this.advogadoService.totalPages(),
    totalElements: this.advogadoService.totalElements(),
    last: this.advogadoService.last(),
  }));

  protected readonly advogadoColumns: TableColumn<AdvogadoApi>[] = [
    { key: 'nome', header: 'Nome', width: '220px' },
    { key: 'oab', header: 'OAB', width: '150px' },
    {
      key: 'cpf',
      header: 'CPF',
      width: '140px',
      formatter: (value) => (value ? maskCpf(String(value)) : '-'),
    },
    { key: 'email', header: 'E-mail', width: '220px' },
    { key: 'cidade_profissional', header: 'Cidade', width: '160px' },
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
    // Busca com debounce: só dispara requisição 300ms depois de parar de digitar.
    const buscaDebounced = toSignal(
      toObservable(this.busca).pipe(debounceTime(300), distinctUntilChanged()),
      { initialValue: this.busca() },
    );
    // Nova busca sempre volta pra primeira página.
    toObservable(buscaDebounced)
      .pipe(skip(1), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.page.set(0));

    const query = computed<AdvogadoListQuery & { tick: number }>(() => ({
      page: this.page(),
      busca: buscaDebounced(),
      incluirInativos: this.incluirInativos(),
      tick: this.reloadTick(),
    }));

    toObservable(query)
      .pipe(
        switchMap((q) => {
          this.loading.set(true);
          return this.advogadoService.carregar(q).pipe(
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

  protected onToggleIncluirInativos(event: Event): void {
    this.incluirInativos.set((event.target as HTMLInputElement).checked);
    this.page.set(0);
  }

  protected toggleFavorito(row: AdvogadoApi, event: MouseEvent): void {
    event.stopPropagation();
    this.advogadoService.alternarFavorito(row.id);
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

  /** Clique fora fecha o menu "Colunas". */
  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    const grade = this.grade();
    if (grade?.columnsMenuOpen() && !target?.closest('.advogados-columns')) {
      grade.columnsMenuOpen.set(false);
    }
  }
}
