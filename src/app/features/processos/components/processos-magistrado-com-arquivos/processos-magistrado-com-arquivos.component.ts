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
import { formatFileSize } from '../../../../shared/utils/format-file-size';
import { MagistradoProcessosComArquivosService } from '../../services/magistrado-processos-com-arquivos.service';
import { ProcessoPastaResumo } from '../../services/processo-pasta-resumo.model';

/**
 * Tabela de todos os processos vinculados a um magistrado, cada um com o resumo da pasta dele —
 * mostrada no diálogo "Pasta do magistrado" quando nenhum processo está selecionado. Cópia fiel
 * de `ClientesComArquivosComponent`, sem busca/paginação (lista curta, de um único magistrado).
 * Clicar numa linha emite `rowOpen`.
 */
@Component({
  selector: 'app-processos-magistrado-com-arquivos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTableComponent],
  templateUrl: './processos-magistrado-com-arquivos.component.html',
  styleUrl: './processos-magistrado-com-arquivos.component.scss',
})
export class ProcessosMagistradoComArquivosComponent {
  private readonly service = inject(MagistradoProcessosComArquivosService);
  private readonly destroyRef = inject(DestroyRef);

  readonly magistradoId = input.required<number>();
  /** O pai incrementa isto para forçar um reload (ex.: ao voltar do explorador). */
  readonly recarregarTick = input(0);

  readonly rowOpen = output<ProcessoPastaResumo>();

  protected readonly itens = signal<ProcessoPastaResumo[]>([]);
  protected readonly loading = signal(false);
  protected readonly loadError = signal(false);
  private readonly retryTick = signal(0);

  protected readonly columns: TableColumn<ProcessoPastaResumo>[] = [
    {
      key: 'numeroProcesso',
      header: 'Processo',
      width: '220px',
      formatter: (_value, row) => row.numeroProcesso || '-',
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
    const gatilho = computed(() => ({
      magistradoId: this.magistradoId(),
      tick: this.recarregarTick(),
      retry: this.retryTick(),
    }));

    toObservable(gatilho)
      .pipe(
        switchMap(({ magistradoId }) => {
          this.loading.set(true);
          return this.service.listar(magistradoId).pipe(
            catchError(() => {
              this.loading.set(false);
              this.loadError.set(true);
              return EMPTY;
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((itens) => {
        this.itens.set(itens);
        this.loading.set(false);
        this.loadError.set(false);
      });
  }

  protected onRowClick(row: ProcessoPastaResumo): void {
    this.rowOpen.emit(row);
  }

  protected recarregar(): void {
    this.loadError.set(false);
    this.retryTick.update((tick) => tick + 1);
  }
}
