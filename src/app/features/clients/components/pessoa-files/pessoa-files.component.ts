import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';

import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { PessoaArquivo } from '../../services/pessoa-arquivo.model';
import { PessoaArquivoService } from '../../services/pessoa-arquivo.service';
import { PessoaFileUploadComponent } from '../pessoa-file-upload/pessoa-file-upload.component';

export type PessoaFilesNoticeKey =
  | 'saveBeforeUpload'
  | 'uploadOk'
  | 'uploadError'
  | 'fileRemoved'
  | 'removeError'
  | 'downloadError'
  | 'viewError';

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
  imports: [PessoaFileUploadComponent, ModalComponent],
  templateUrl: './pessoa-files.component.html',
  styleUrl: './pessoa-files.component.scss',
})
export class PessoaFilesComponent {
  private readonly arquivos = inject(PessoaArquivoService);

  /** Id da pessoa persistida; `0` = ficha nova (ainda sem arquivos). */
  readonly pessoaId = input<number>(0);
  readonly notify = output<PessoaFilesNotice>();

  protected readonly search = signal('');
  protected readonly selectedId = signal<number | null>(null);
  protected readonly uploadOpen = signal(false);
  protected readonly loading = signal(false);
  protected readonly items = signal<PessoaArquivo[]>([]);

  // --- preview de DOCX (renderizado no navegador com docx-preview) ---
  protected readonly docxOpen = signal(false);
  protected readonly docxNome = signal('');
  protected readonly docxCarregando = signal(false);
  private readonly docxBlob = signal<Blob | null>(null);
  private readonly docxHost = viewChild<ElementRef<HTMLElement>>('docxHost');

  protected readonly rows = computed<PessoaArquivo[]>(() => {
    const search = this.normalizeKey(this.search());
    const items = this.items();
    return search
      ? items.filter((item) => this.normalizeKey(item.nome).includes(search))
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

    // Renderiza o DOCX assim que o modal monta o container e o blob chega.
    effect(() => {
      const host = this.docxHost()?.nativeElement;
      const blob = this.docxBlob();
      if (host && blob) {
        this.renderizarDocx(host, blob);
      }
    });
  }

  private async renderizarDocx(host: HTMLElement, blob: Blob): Promise<void> {
    this.docxCarregando.set(true);
    host.replaceChildren();
    try {
      const { renderAsync } = await import('docx-preview');
      await renderAsync(blob, host, undefined, { ignoreLastRenderedPageBreak: true });
    } catch {
      this.notify.emit({ key: 'viewError', subject: this.docxNome() });
      this.docxOpen.set(false);
    } finally {
      this.docxCarregando.set(false);
      this.docxBlob.set(null);
    }
  }

  protected fecharDocx(): void {
    this.docxOpen.set(false);
    this.docxBlob.set(null);
    this.docxHost()?.nativeElement.replaceChildren();
  }

  protected updateSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected selectFile(row: PessoaArquivo): void {
    this.selectedId.set(row.id);
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

  /** MIME para abrir em nova aba conforme a extensão — `null` = não é PDF nem imagem. */
  private tipoNovaAba(nome: string): string | null {
    const n = nome.toLowerCase();
    if (n.endsWith('.pdf')) return 'application/pdf';
    if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
    if (n.endsWith('.png')) return 'image/png';
    if (n.endsWith('.gif')) return 'image/gif';
    if (n.endsWith('.webp')) return 'image/webp';
    return null;
  }

  private ehDocx(nome: string): boolean {
    return nome.toLowerCase().endsWith('.docx');
  }

  /** PDF e imagens abrem em nova aba; DOCX renderiza num modal (docx-preview). */
  protected podeVisualizar(row: PessoaArquivo): boolean {
    return this.tipoNovaAba(row.nome) !== null || this.ehDocx(row.nome);
  }

  protected visualizar(row: PessoaArquivo): void {
    const id = this.pessoaId();
    if (id <= 0) {
      return;
    }
    if (this.ehDocx(row.nome)) {
      this.visualizarDocx(id, row);
      return;
    }
    this.visualizarNovaAba(id, row);
  }

  /** Baixa o DOCX e abre o modal de preview — o `effect` chama o docx-preview quando o container monta. */
  private visualizarDocx(pessoaId: number, row: PessoaArquivo): void {
    this.docxNome.set(row.nome);
    this.docxCarregando.set(true);
    this.docxOpen.set(true);
    this.arquivos.baixar(pessoaId, row.id).subscribe({
      next: (response) => {
        if (response.body) {
          this.docxBlob.set(response.body);
        } else {
          this.fecharDocx();
        }
      },
      error: () => {
        this.docxCarregando.set(false);
        this.docxOpen.set(false);
        this.notify.emit({ key: 'viewError', subject: row.nome });
      },
    });
  }

  /** Abre PDF/imagem numa nova aba, sem baixar. */
  private visualizarNovaAba(pessoaId: number, row: PessoaArquivo): void {
    // Abre a aba já no clique (gesto do usuário) para não cair no bloqueador de pop-up;
    // a URL do blob é setada quando o download termina.
    const aba = window.open('', '_blank');
    const mime = this.tipoNovaAba(row.nome) ?? 'application/octet-stream';
    this.arquivos.baixar(pessoaId, row.id).subscribe({
      next: (response) => {
        if (!response.body) {
          aba?.close();
          return;
        }
        const url = URL.createObjectURL(new Blob([response.body], { type: mime }));
        if (aba) {
          aba.location.href = url;
        } else {
          window.open(url, '_blank');
        }
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: () => {
        aba?.close();
        this.notify.emit({ key: 'viewError', subject: row.nome });
      },
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
