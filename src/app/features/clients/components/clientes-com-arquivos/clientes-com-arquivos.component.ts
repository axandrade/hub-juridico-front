import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, debounceTime, distinctUntilChanged, skip, switchMap } from 'rxjs';

import { DataTableComponent } from '../../../../shared/components/table/data-table.component';
import { TableColumn } from '../../../../shared/components/table/table-column.model';
import { TablePagination } from '../../../../shared/components/table/table.model';
import { formatFileSize } from '../../../../shared/utils/format-file-size';
import { ClientePastaResumo } from '../../services/cliente-pasta-resumo.model';
import { ClientesComArquivosService } from '../../services/clientes-com-arquivos.service';

/**
 * Tabela paginada dos clientes que já têm arquivos — mostrada no diálogo "Abrir pasta do
 * cliente" quando nenhum cliente está selecionado. Busca por nome/CPF/CNPJ no servidor;
 * ordenada por último envio (mais recente primeiro). Clicar numa linha emite `rowOpen`.
 */
@Component({
  selector: 'app-clientes-com-arquivos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTableComponent],
  templateUrl: './clientes-com-arquivos.component.html',
  styleUrl: './clientes-com-arquivos.component.scss',
})
export class ClientesComArquivosComponent {
  private readonly clientesComArquivosService = inject(ClientesComArquivosService);
  private readonly destroyRef = inject(DestroyRef);

  /** O pai incrementa isto para forçar um reload (ex.: ao voltar do explorador). */
  readonly recarregarTick = input(0);

  readonly rowOpen = output<ClientePastaResumo>();

  protected readonly itens = this.clientesComArquivosService.itens;
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  protected readonly busca = signal('');
  private readonly page = signal(0);
  private readonly retryTick = signal(0);

  protected readonly pagination = computed<TablePagination>(() => ({
    page: this.clientesComArquivosService.page(),
    totalPages: this.clientesComArquivosService.totalPages(),
    totalElements: this.clientesComArquivosService.totalElements(),
    last: this.clientesComArquivosService.last(),
  }));

  protected readonly columns: TableColumn<ClientePastaResumo>[] = [
    {
      key: 'nome',
      header: 'Cliente',
      width: '280px',
      formatter: (_value, row) => row.nome || '-',
    },
    {
      key: 'conteudo',
      header: 'Conteúdo',
      width: '160px',
      formatter: (_value, row) => {
        const arquivos = `${row.qtdDocumentos} arquivo${row.qtdDocumentos === 1 ? '' : 's'}`;
        const pastas = `${row.qtdPastas} pasta${row.qtdPastas === 1 ? '' : 's'}`;
        return `${arquivos} · ${pastas}`;
      },
    },
    {
      key: 'tamanhoTotalBytes',
      header: 'Tamanho',
      width: '110px',
      align: 'right',
      formatter: (_value, row) => formatFileSize(row.tamanhoTotalBytes),
    },
    { key: 'ultimoEnvioEm', header: 'Último envio', width: '150px', format: 'date' },
    { key: 'abrir', header: '', width: '96px', formatter: () => '' },
  ];

  constructor() {
    const buscaDebounced = toSignal(
      toObservable(this.busca).pipe(debounceTime(300), distinctUntilChanged()),
      { initialValue: this.busca() },
    );
    toObservable(buscaDebounced)
      .pipe(skip(1), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.page.set(0));

    const gatilho = computed(() => ({
      page: this.page(),
      busca: buscaDebounced(),
      tick: this.recarregarTick(),
      retry: this.retryTick(),
    }));

    toObservable(gatilho)
      .pipe(
        switchMap(({ page, busca }) => {
          this.loading.set(true);
          return this.clientesComArquivosService.carregar(page, busca).pipe(
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

  protected onBuscaInput(event: Event): void {
    this.busca.set((event.target as HTMLInputElement).value);
  }

  protected limparBusca(): void {
    this.busca.set('');
  }

  protected onPageChange(page: number): void {
    this.page.set(page);
  }

  protected onRowClick(row: ClientePastaResumo): void {
    this.rowOpen.emit(row);
  }

  protected recarregar(): void {
    this.loadError.set(false);
    this.retryTick.update((tick) => tick + 1);
  }
}
