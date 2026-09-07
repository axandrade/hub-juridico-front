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
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, switchMap } from 'rxjs';

import { DataTableComponent } from '../../../../shared/components/table/data-table.component';
import { TableColumn } from '../../../../shared/components/table/table-column.model';
import { TablePagination } from '../../../../shared/components/table/table.model';
import { formatFileSize } from '../../../../shared/utils/format-file-size';
import { ClientePastaResumo } from '../../services/cliente-pasta-resumo.model';
import { ClientesComArquivosService } from '../../services/clientes-com-arquivos.service';

/**
 * Tabela paginada dos clientes que já têm arquivos — mostrada no diálogo "Abrir pasta do
 * cliente" quando nenhum cliente está selecionado. Clicar numa linha emite `rowOpen` para o
 * pai (`clients.component`) abrir o explorador daquele cliente no mesmo modal.
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
      width: '260px',
      formatter: (_value, row) => row.nome || '-',
    },
    {
      key: 'tipo',
      header: 'Natureza',
      width: '140px',
      formatter: (_value, row) => (row.tipo === 'FISICA' ? 'Pessoa física' : 'Pessoa jurídica'),
    },
    { key: 'qtdPastas', header: 'Pastas', width: '90px', align: 'right' },
    { key: 'qtdDocumentos', header: 'Arquivos', width: '90px', align: 'right' },
    {
      key: 'tamanhoTotalBytes',
      header: 'Tamanho',
      width: '110px',
      align: 'right',
      formatter: (_value, row) => formatFileSize(row.tamanhoTotalBytes),
    },
    { key: 'ultimoEnvioEm', header: 'Último envio', width: '150px', format: 'date' },
  ];

  constructor() {
    const gatilho = computed(() => ({
      page: this.page(),
      tick: this.recarregarTick(),
      retry: this.retryTick(),
    }));

    toObservable(gatilho)
      .pipe(
        switchMap(({ page }) => {
          this.loading.set(true);
          return this.clientesComArquivosService.carregar(page).pipe(
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

  protected onRowClick(row: ClientePastaResumo): void {
    this.rowOpen.emit(row);
  }

  protected recarregar(): void {
    this.loadError.set(false);
    this.retryTick.update((tick) => tick + 1);
  }
}
