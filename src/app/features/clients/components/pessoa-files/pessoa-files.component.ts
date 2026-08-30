import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

/** Dados do dossiê que a lista de arquivos precisa (só leitura). */
export interface PessoaFilesInfo {
  folder: string;
  file: string;
  contractNumber: string;
  contractDate: string;
  registeredAt: Date;
}

export type PessoaFilesNoticeKey =
  | 'fileSelected'
  | 'folderReady'
  | 'saveToCreateFolder'
  | 'fileReady'
  | 'noLinkedFile';

/** Aviso emitido para o rodapé de status do painel (`pessoa-form`). */
export interface PessoaFilesNotice {
  key: PessoaFilesNoticeKey;
  subject?: string;
}

interface FileRow {
  name: string;
  kind: 'folder' | 'mainFile' | 'contract';
  updatedAt: string;
}

/**
 * Aba "Lista de arquivos" do painel de pessoa. Só leitura: monta as linhas a
 * partir de `info` (pasta / arquivo principal / contrato do dossiê) e avisa o
 * painel via `notify` para o rodapé de status. Não toca no formulário.
 */
@Component({
  selector: 'app-pessoa-files',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pessoa-files.component.html',
  styleUrl: './pessoa-files.component.scss',
})
export class PessoaFilesComponent {
  readonly info = input.required<PessoaFilesInfo>();
  readonly notify = output<PessoaFilesNotice>();

  protected readonly search = signal('');
  protected readonly selectedName = signal('');

  protected readonly rows = computed<FileRow[]>(() => {
    const info = this.info();
    const updatedAt = this.formatDate(info.registeredAt);
    const search = this.normalizeKey(this.search());
    const rows: FileRow[] = [];

    if (info.folder) {
      rows.push({ name: info.folder, kind: 'folder', updatedAt });
    }
    if (info.file) {
      rows.push({ name: info.file, kind: 'mainFile', updatedAt });
    }
    if (info.contractNumber) {
      rows.push({
        name: info.contractNumber,
        kind: 'contract',
        updatedAt: info.contractDate || updatedAt,
      });
    }

    return search
      ? rows.filter((row) => this.normalizeKey(`${row.name} ${row.kind}`).includes(search))
      : rows;
  });

  protected updateSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected selectFile(row: FileRow): void {
    this.selectedName.set(row.name);
    this.notify.emit({ key: 'fileSelected', subject: row.name });
  }

  protected openFolder(): void {
    const folder = this.info().folder;
    this.notify.emit({ key: folder ? 'folderReady' : 'saveToCreateFolder', subject: folder });
  }

  protected openFile(): void {
    const file = this.info().file || this.selectedName();
    this.notify.emit({ key: file ? 'fileReady' : 'noLinkedFile', subject: file });
  }

  private formatDate(date: Date): string {
    return new Intl.DateTimeFormat('pt-BR').format(date);
  }

  private normalizeKey(value: string): string {
    return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }
}
