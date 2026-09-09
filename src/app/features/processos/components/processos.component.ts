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

import { ButtonComponent } from '../../../shared/components/button/button.component';
import { DataTableComponent } from '../../../shared/components/table/data-table.component';
import { TableColumn } from '../../../shared/components/table/table-column.model';
import { TablePagination, TablePinAction } from '../../../shared/components/table/table.model';
import { PanelShellController } from '../../../shared/panel-shell/panel-shell.controller';
import {
  ProcessoApi,
  ProcessoResumoApi,
  TIPO_PROCESSO_LABEL,
  TipoProcesso,
} from '../services/processo-api.model';
import { ProcessoListQuery, ProcessoService } from '../services/processo-service';
import { ProcessoFormComponent } from './processo-form/processo-form.component';

/**
 * Tela de Processos — tabela + painel lateral posicionável (`app-processo-form`), mesmo conceito
 * de Advogados/Clientes. "Novo" abre o painel limpo; clicar numa linha abre o processo em edição.
 * Posição/tamanho/visibilidade do painel vêm do `PanelShellController`.
 */
@Component({
  selector: 'app-processos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTableComponent, ButtonComponent, ProcessoFormComponent],
  templateUrl: './processos.component.html',
  styleUrl: './processos.component.scss',
})
export class ProcessosComponent {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly processoService = inject(ProcessoService);

  private readonly form = viewChild(ProcessoFormComponent);
  /** A grade — o botão "Colunas" da barra de ações comanda esta instância. */
  protected readonly grade = viewChild(DataTableComponent);

  protected readonly panelShell = new PanelShellController(this.document, {
    storagePrefix: 'hub-juridico.processos',
    larguraPadrao: 420,
  });

  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  protected readonly selectedId = signal<number | null>(null);

  private readonly page = signal(0);
  private readonly reloadTick = signal(0);
  /** `true` traz também processos inativos — reflete o `incluirInativos` real do backend. */
  protected readonly incluirInativos = signal(false);
  /** Busca livre (número / status / natureza / ação / cidade) — resolvida no servidor, com debounce. */
  protected readonly busca = signal('');

  protected readonly processos = this.processoService.processos;
  protected readonly totalProcessos = this.processoService.totalElements;
  protected readonly pagination = computed<TablePagination>(() => ({
    page: this.processoService.page(),
    totalPages: this.processoService.totalPages(),
    totalElements: this.processoService.totalElements(),
    last: this.processoService.last(),
  }));

  protected readonly processoColumns: TableColumn<ProcessoResumoApi>[] = [
    {
      key: 'numero_cnj',
      header: 'Número',
      width: '190px',
      formatter: (value) => (value ? String(value) : '—'),
    },
    {
      key: 'tipo',
      header: 'Tipo',
      width: '130px',
      formatter: (value) => TIPO_PROCESSO_LABEL[value as TipoProcesso] ?? String(value ?? '—'),
    },
    {
      key: 'status',
      header: 'Status',
      width: '120px',
      formatter: (value) => (value ? String(value) : '—'),
    },
    {
      key: 'natureza',
      header: 'Natureza',
      width: '140px',
      formatter: (value) => (value ? String(value) : '—'),
    },
    {
      key: 'fase',
      header: 'Fase',
      width: '160px',
      formatter: (value) => (value ? String(value) : '—'),
    },
    {
      key: 'cidade',
      header: 'Comarca',
      width: '170px',
      formatter: (_value, row) =>
        row.cidade ? `${row.cidade}${row.uf ? '/' + row.uf : ''}` : (row.uf ?? '—'),
    },
    {
      key: 'data_distribuicao',
      header: 'Distribuição',
      width: '130px',
      formatter: (value) => (value ? String(value).split('-').reverse().join('/') : '—'),
    },
    {
      key: 'ativo',
      header: 'Situação',
      width: '110px',
      align: 'center',
      format: 'badge',
      badgeDot: true,
      formatter: (value) => (value ? 'Ativo' : 'Inativo'),
      badgeTone: (value) => (value ? 'success' : 'neutral'),
    },
  ];

  protected readonly processoRowClass = (row: ProcessoResumoApi): Record<string, boolean> => ({
    'is-selected': this.selectedId() === row.id,
    'is-favorite': row.favorito,
    'is-inactive': !row.ativo,
  });

  protected readonly processoPinFirst = (row: ProcessoResumoApi): boolean => row.favorito;

  protected readonly processoPinAction: TablePinAction<ProcessoResumoApi> = {
    isActive: (row) => row.favorito,
    onToggle: (row, event) => this.toggleFavorito(row, event),
    ariaLabel: 'Favoritar processo',
  };

  constructor() {
    const buscaDebounced = toSignal(
      toObservable(this.busca).pipe(debounceTime(300), distinctUntilChanged()),
      { initialValue: this.busca() },
    );
    toObservable(buscaDebounced)
      .pipe(skip(1), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.page.set(0));

    const query = computed<ProcessoListQuery & { tick: number }>(() => ({
      page: this.page(),
      busca: buscaDebounced(),
      incluirInativos: this.incluirInativos(),
      tick: this.reloadTick(),
    }));

    toObservable(query)
      .pipe(
        switchMap((q) => {
          this.loading.set(true);
          return this.processoService.carregar(q).pipe(
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

  protected toggleFavorito(row: ProcessoResumoApi, event: MouseEvent): void {
    event.stopPropagation();
    this.processoService.alternarFavorito(row.id);
  }

  protected reloadList(): void {
    this.loadError.set(false);
    this.reloadTick.update((tick) => tick + 1);
  }

  private refreshList(): void {
    this.reloadTick.update((tick) => tick + 1);
  }

  /** Botão "Novo" — abre o painel limpo pra cadastrar. */
  protected novoProcesso(): void {
    this.selectedId.set(null);
    this.panelShell.setPanelVisible(true);
  }

  protected selecionarProcesso(row: ProcessoResumoApi): void {
    const form = this.form();
    if (form?.locked() && this.selectedId() !== row.id) {
      form.notifyLockedSelection();
      return;
    }
    this.selectedId.set(row.id);
    this.panelShell.setPanelVisible(true);
  }

  protected onSaved(processo: ProcessoApi): void {
    this.selectedId.set(processo.id);
    this.refreshList();
  }

  protected onStatusChanged(processo: ProcessoApi): void {
    this.selectedId.set(processo.id);
    this.refreshList();
  }

  protected onCleared(): void {
    this.selectedId.set(null);
    this.refreshList();
  }

  /** No modo diálogo, Esc esconde o painel (mantém o processo selecionado). */
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
    if (grade?.columnsMenuOpen() && !target?.closest('.processos-columns')) {
      grade.columnsMenuOpen.set(false);
    }
  }
}
