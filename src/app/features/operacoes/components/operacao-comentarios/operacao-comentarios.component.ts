import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';

import { DomainService, IDomainPage } from '../../../../core/services/domain.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { DateFormatPipe } from '../../../../shared/pipes/date-format.pipe';
import { ToastService } from '../../../../shared/services/toast.service';
import { Documento } from '../../../documents/models/document-explorer.model';
import { ComentarioDocumentsService } from '../../services/comentario-documents.service';

const ENTITY = 'operacao-comentario';

interface OperacaoComentarioRow {
  id: number;
  operacaoId: number;
  texto: string;
  autorId: number;
  criadoEm: string;
}

interface ComentarioView extends OperacaoComentarioRow {
  autorNome: string;
  documentos: Documento[];
  carregandoDocumentos: boolean;
  enviando: boolean;
  progresso: number | null;
}

/** Aba "Comentários": zero, um ou vários comentários por operação, cada um com documentos anexados (lista simples, ver `ComentarioDocumentsService`). */
@Component({
  selector: 'app-operacao-comentarios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, DateFormatPipe],
  templateUrl: './operacao-comentarios.component.html',
  styleUrl: './operacao-comentarios.component.scss',
})
export class OperacaoComentariosComponent {
  private readonly domainService = inject(DomainService);
  private readonly documentsService = inject(ComentarioDocumentsService);
  private readonly toast = inject(ToastService);
  private readonly document = inject(DOCUMENT);
  private readonly nomesAutores = new Map<number, string>();

  readonly operacaoId = input<number | null>(null);

  protected readonly carregando = signal(false);
  protected readonly enviandoComentario = signal(false);
  protected readonly comentarios = signal<ComentarioView[]>([]);
  protected readonly erro = signal('');

  constructor() {
    effect(() => {
      const operacaoId = this.operacaoId();
      untracked(() => {
        if (operacaoId === null) {
          this.comentarios.set([]);
          this.erro.set('');
          return;
        }
        this.carregar(operacaoId);
      });
    });
  }

  protected adicionarComentario(textarea: HTMLTextAreaElement): void {
    const texto = textarea.value.trim();
    const operacaoId = this.operacaoId();
    if (!texto || operacaoId === null) {
      return;
    }
    this.enviandoComentario.set(true);
    this.domainService
      .post({ entityName: ENTITY, body: { operacao_id: operacaoId, texto } })
      .subscribe({
        next: () => {
          textarea.value = '';
          this.enviandoComentario.set(false);
          this.carregar(operacaoId);
        },
        error: (err: unknown) => {
          this.enviandoComentario.set(false);
          this.toast.erro(`Não foi possível adicionar o comentário: ${this.httpErrorMessage(err)}`);
        },
      });
  }

  protected excluirComentario(comentario: ComentarioView): void {
    const operacaoId = this.operacaoId();
    const confirmado = this.document.defaultView?.confirm('Excluir este comentário? Essa ação não pode ser desfeita por aqui.');
    if (!confirmado) {
      return;
    }
    this.domainService.patch({ entityName: ENTITY, entityId: comentario.id, body: { ativo: false } }).subscribe({
      next: () => {
        if (operacaoId !== null) {
          this.carregar(operacaoId);
        }
      },
      error: (err: unknown) => this.toast.erro(`Não foi possível excluir o comentário: ${this.httpErrorMessage(err)}`),
    });
  }

  protected anexarArquivo(comentario: ComentarioView, input: HTMLInputElement): void {
    const arquivo = input.files?.[0];
    if (!arquivo) {
      return;
    }
    this.atualizarComentario(comentario.id, { enviando: true, progresso: 0 });
    this.documentsService.enviar(comentario.id, arquivo).subscribe({
      next: (evento) => {
        if (evento.tipo === 'progresso') {
          const percentual = evento.total ? Math.round((evento.enviados / evento.total) * 100) : 0;
          this.atualizarComentario(comentario.id, { progresso: percentual });
          return;
        }
        this.comentarios.update((lista) =>
          lista.map((c) =>
            c.id === comentario.id
              ? { ...c, enviando: false, progresso: null, documentos: [...c.documentos, evento.documento] }
              : c,
          ),
        );
      },
      error: (err: unknown) => {
        this.atualizarComentario(comentario.id, { enviando: false, progresso: null });
        this.toast.erro(`Não foi possível enviar o arquivo: ${this.httpErrorMessage(err)}`);
      },
      complete: () => {
        input.value = '';
      },
    });
  }

  protected excluirDocumento(comentario: ComentarioView, documento: Documento): void {
    this.documentsService.excluir(documento.id).subscribe({
      next: () => {
        this.comentarios.update((lista) =>
          lista.map((c) =>
            c.id === comentario.id ? { ...c, documentos: c.documentos.filter((d) => d.id !== documento.id) } : c,
          ),
        );
      },
      error: (err: unknown) => this.toast.erro(`Não foi possível excluir o anexo: ${this.httpErrorMessage(err)}`),
    });
  }

  protected baixarDocumento(documento: Documento): void {
    this.documentsService.downloadUrl(documento.id).subscribe({
      next: (url) => this.document.defaultView?.open(url, '_blank'),
      error: (err: unknown) => this.toast.erro(`Não foi possível baixar o arquivo: ${this.httpErrorMessage(err)}`),
    });
  }

  private carregar(operacaoId: number): void {
    this.carregando.set(true);
    this.erro.set('');
    this.domainService
      .get<IDomainPage<OperacaoComentarioRow>>({
        entityName: ENTITY,
        fields: 'id,operacaoId,texto,autorId,criadoEm',
        filter: `operacaoId eq ${operacaoId} and ativo eq true`,
        sort: '-criadoEm',
        size: 500,
      })
      .subscribe({
        next: (pagina) => {
          this.comentarios.set(
            pagina.content.map((c) => ({
              ...c,
              autorNome: this.nomesAutores.get(c.autorId) ?? '',
              documentos: [],
              carregandoDocumentos: true,
              enviando: false,
              progresso: null,
            })),
          );
          this.carregando.set(false);
          pagina.content.forEach((c) => {
            this.carregarAutor(c.autorId);
            this.carregarDocumentos(c.id);
          });
        },
        error: (err: unknown) => {
          this.carregando.set(false);
          this.erro.set(this.httpErrorMessage(err));
        },
      });
  }

  private carregarAutor(autorId: number): void {
    if (this.nomesAutores.has(autorId)) {
      return;
    }
    this.domainService.get<{ name: string }>({ entityName: 'user', entityId: autorId, fields: 'name' }).subscribe((u) => {
      const nome = u?.name ?? '';
      this.nomesAutores.set(autorId, nome);
      this.comentarios.update((lista) => lista.map((c) => (c.autorId === autorId ? { ...c, autorNome: nome } : c)));
    });
  }

  private carregarDocumentos(comentarioId: number): void {
    this.documentsService.listar(comentarioId).subscribe({
      next: (documentos) => this.atualizarComentario(comentarioId, { documentos, carregandoDocumentos: false }),
      error: () => this.atualizarComentario(comentarioId, { carregandoDocumentos: false }),
    });
  }

  private atualizarComentario(comentarioId: number, mudancas: Partial<ComentarioView>): void {
    this.comentarios.update((lista) => lista.map((c) => (c.id === comentarioId ? { ...c, ...mudancas } : c)));
  }

  private httpErrorMessage(err: unknown): string {
    const e = err as {
      error?: { detail?: string; title?: string; message?: string };
      message?: string;
      status?: number;
    };
    if (e?.status === 0) {
      return 'Sem conexão com o servidor.';
    }
    return (
      e?.error?.detail ||
      e?.error?.title ||
      e?.error?.message ||
      e?.message ||
      'Erro ao comunicar com o servidor.'
    );
  }
}
