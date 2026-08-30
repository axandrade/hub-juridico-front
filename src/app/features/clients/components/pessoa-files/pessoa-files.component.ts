import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { PessoaArquivo, TIPO_ARQUIVO_LABEL } from '../../services/pessoa-arquivo.model';
import { PessoaArquivoService } from '../../services/pessoa-arquivo.service';
import { PessoaFileUploadComponent } from '../pessoa-file-upload/pessoa-file-upload.component';

export type PessoaFilesNoticeKey =
  | 'folderReady'
  | 'saveToCreateFolder'
  | 'saveBeforeUpload'
  | 'uploadOk'
  | 'uploadError'
  | 'fileRemoved'
  | 'removeError'
  | 'downloadError';

/** Aviso emitido para o rodapé de status do painel (`pessoa-form`). */
export interface PessoaFilesNotice {
  key: PessoaFilesNoticeKey;
  subject?: string;
}

/**
 * Aba "Lista de arquivos" do painel de pessoa. Lista os arquivos reais da API
 * (`/api/v1/pessoas/{pessoaId}/arquivos`), baixa e remove; o envio abre o
 * `app-pessoa-file-upload`. Só funciona com a pessoa já persistida (`pessoaId > 0`).
 */
@Component({
  selector: 'app-pessoa-files',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PessoaFileUploadComponent],
  templateUrl: './pessoa-files.component.html',
  styleUrl: './pessoa-files.component.scss',
})
export class PessoaFilesComponent {
  private readonly arquivos = inject(PessoaArquivoService);

  /** Nome da pasta do dossiê (texto) — só para o botão "Abrir pasta". */
  readonly folder = input<string>('');
  /** Id da pessoa persistida; `0` = ficha nova (ainda sem arquivos). */
  readonly pessoaId = input<number>(0);
  readonly notify = output<PessoaFilesNotice>();

  protected readonly tipoLabel = TIPO_ARQUIVO_LABEL;
  protected readonly search = signal('');
  protected readonly selectedId = signal<number | null>(null);
  protected readonly uploadOpen = signal(false);
  protected readonly loading = signal(false);
  protected readonly items = signal<PessoaArquivo[]>([]);

  protected readonly rows = computed<PessoaArquivo[]>(() => {
    const search = this.normalizeKey(this.search());
    const items = this.items();
    return search
      ? items.filter((item) =>
          this.normalizeKey(`${item.nome} ${this.tipoLabel[item.tipo]}`).includes(search),
        )
      : items;
  });

  constructor() {
    effect(() => {
      const id = this.pessoaId();
      if (id > 0) {
        this.carregar(id);
      } else {
        this.items.set([]);
        this.selectedId.set(null);
      }
    });
  }

  protected updateSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected selectFile(row: PessoaArquivo): void {
    this.selectedId.set(row.id);
  }

  protected openFolder(): void {
    const folder = this.folder();
    this.notify.emit({ key: folder ? 'folderReady' : 'saveToCreateFolder', subject: folder });
  }

  protected openUpload(): void {
    if (this.pessoaId() <= 0) {
      this.notify.emit({ key: 'saveBeforeUpload' });
      return;
    }
    this.uploadOpen.set(true);
  }

  protected onUploaded(arquivo: PessoaArquivo): void {
    this.uploadOpen.set(false);
    this.items.update((list) => [arquivo, ...list.filter((item) => item.id !== arquivo.id)]);
    this.notify.emit({ key: 'uploadOk', subject: arquivo.nome });
  }

  protected onUploadFailed(message: string): void {
    this.notify.emit({ key: 'uploadError', subject: message });
  }

  protected download(row: PessoaArquivo): void {
    const id = this.pessoaId();
    if (id <= 0) {
      return;
    }
    this.arquivos.baixar(id, row.id).subscribe({
      next: (response) => this.saveBlob(response.body, row.nome),
      error: () => this.notify.emit({ key: 'downloadError', subject: row.nome }),
    });
  }

  protected remove(row: PessoaArquivo): void {
    const id = this.pessoaId();
    if (id <= 0) {
      return;
    }
    this.arquivos.remover(id, row.id).subscribe({
      next: () => {
        this.items.update((list) => list.filter((item) => item.id !== row.id));
        if (this.selectedId() === row.id) {
          this.selectedId.set(null);
        }
        this.notify.emit({ key: 'fileRemoved', subject: row.nome });
      },
      error: () => this.notify.emit({ key: 'removeError', subject: row.nome }),
    });
  }

  protected formatSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    const kb = bytes / 1024;
    return kb < 1024 ? `${kb.toFixed(kb < 10 ? 1 : 0)} KB` : `${(kb / 1024).toFixed(1)} MB`;
  }

  protected formatDate(date: Date): string {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  private carregar(pessoaId: number): void {
    this.loading.set(true);
    this.arquivos.listar(pessoaId).subscribe({
      next: (list) => {
        this.items.set(list);
        this.loading.set(false);
      },
      error: () => {
        this.items.set([]);
        this.loading.set(false);
      },
    });
  }

  private saveBlob(blob: Blob | null, filename: string): void {
    if (!blob) {
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  private normalizeKey(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();
  }
}
