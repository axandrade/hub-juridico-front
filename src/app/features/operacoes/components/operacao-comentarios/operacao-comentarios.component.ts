import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

import { AuthService } from '../../../../core/services/auth.service';
import { DomainService, IDomainPage } from '../../../../core/services/domain.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { DateFormatPipe } from '../../../../shared/pipes/date-format.pipe';
import { MarkdownLitePipe } from '../../../../shared/pipes/markdown-lite.pipe';
import { ToastService } from '../../../../shared/services/toast.service';
import { Documento } from '../../../documents/models/document-explorer.model';
import { ComentarioDocumentsService } from '../../services/comentario-documents.service';

const ENTITY = 'operacao-comentario';
/** Altura aproximada do menu da setinha (2 itens + padding), com folga. */
const ALTURA_MENU_PX = 100;

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
}

/** Aba "Comentários": zero, um ou vários comentários por operação, cada um com documentos anexados (lista simples, ver `ComentarioDocumentsService`). */
@Component({
  selector: 'app-operacao-comentarios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, ModalComponent, DateFormatPipe, MarkdownLitePipe],
  templateUrl: './operacao-comentarios.component.html',
  styleUrl: './operacao-comentarios.component.scss',
})
export class OperacaoComentariosComponent {
  private readonly domainService = inject(DomainService);
  private readonly documentsService = inject(ComentarioDocumentsService);
  private readonly toast = inject(ToastService);
  private readonly document = inject(DOCUMENT);
  private readonly auth = inject(AuthService);
  private readonly nomesAutores = new Map<number, string>();

  readonly operacaoId = input<number | null>(null);

  protected readonly carregando = signal(false);
  protected readonly enviandoComentario = signal(false);
  protected readonly comentarios = signal<ComentarioView[]>([]);
  protected readonly erro = signal('');
  protected readonly arquivoSelecionado = signal<File | null>(null);
  protected readonly progressoArquivo = signal<number | null>(null);
  protected readonly comentarioParaExcluir = signal<ComentarioView | null>(null);
  protected readonly excluindoComentario = signal(false);
  protected readonly anexoParaExcluir = signal<{ comentario: ComentarioView; documento: Documento } | null>(null);
  protected readonly excluindoAnexo = signal(false);
  /** Balão com o menu da setinha aberto (estilo WhatsApp) — um por vez; fecha com clique fora/Esc. */
  protected readonly menuAbertoId = signal<number | null>(null);
  protected readonly menuParaCima = signal(false);
  private readonly mensagensEl = viewChild<ElementRef<HTMLElement>>('mensagens');

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

    // Fecha o menu da setinha ao clicar fora / Esc. Ouve o `document` na **fase de captura**
    // (mesmo motivo do `app-combobox`): o `app-modal` que hospeda a operação dá
    // `stopPropagation()` no clique dentro do diálogo, então um listener de bolha nunca receberia.
    // No Esc, a captura também deixa barrar o evento antes do `(document:keydown.escape)` do
    // modal — senão o mesmo Esc fecharia o menu E a operação inteira.
    const aoClicarFora = (event: Event): void => {
      if (this.menuAbertoId() === null) {
        return;
      }
      const alvo = event.target as Element | null;
      // A própria setinha alterna o menu no `(click)` dela; itens do menu fecham ao executar.
      if (alvo?.closest('.operacao-comentario__menu, .operacao-comentario__menu-toggle')) {
        return;
      }
      this.fecharMenu();
    };
    const aoApertarEsc = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || this.menuAbertoId() === null) {
        return;
      }
      event.stopPropagation();
      this.fecharMenu();
    };
    this.document.addEventListener('pointerdown', aoClicarFora, true);
    this.document.addEventListener('keydown', aoApertarEsc, true);
    inject(DestroyRef).onDestroy(() => {
      this.document.removeEventListener('pointerdown', aoClicarFora, true);
      this.document.removeEventListener('keydown', aoApertarEsc, true);
    });
  }

  protected ehMeuComentario(comentario: ComentarioView): boolean {
    return comentario.autorId === this.auth.user()?.id;
  }

  protected aplicarFormato(textarea: HTMLTextAreaElement, tipo: 'negrito' | 'italico' | 'lista' | 'link'): void {
    const inicio = textarea.selectionStart ?? 0;
    const fim = textarea.selectionEnd ?? 0;
    const valor = textarea.value;
    const selecionado = valor.slice(inicio, fim);

    let novoTrecho: string;
    let cursorInicio: number;
    let cursorFim: number;

    switch (tipo) {
      case 'negrito': {
        const texto = selecionado || 'negrito';
        novoTrecho = `**${texto}**`;
        cursorInicio = inicio + 2;
        cursorFim = cursorInicio + texto.length;
        break;
      }
      case 'italico': {
        const texto = selecionado || 'itálico';
        novoTrecho = `*${texto}*`;
        cursorInicio = inicio + 1;
        cursorFim = cursorInicio + texto.length;
        break;
      }
      case 'lista': {
        const trecho = selecionado || 'item';
        novoTrecho = trecho
          .split('\n')
          .map((linha) => (linha.trim() ? `- ${linha}` : linha))
          .join('\n');
        cursorInicio = inicio;
        cursorFim = inicio + novoTrecho.length;
        break;
      }
      case 'link': {
        const texto = selecionado || 'texto do link';
        novoTrecho = `[${texto}](url)`;
        cursorInicio = inicio + texto.length + 3;
        cursorFim = cursorInicio + 3;
        break;
      }
    }

    textarea.value = valor.slice(0, inicio) + novoTrecho + valor.slice(fim);
    textarea.focus();
    textarea.setSelectionRange(cursorInicio, cursorFim);
  }

  protected selecionarArquivo(input: HTMLInputElement): void {
    this.arquivoSelecionado.set(input.files?.[0] ?? null);
  }

  protected removerArquivoSelecionado(input: HTMLInputElement): void {
    this.arquivoSelecionado.set(null);
    input.value = '';
  }

  protected adicionarComentario(textarea: HTMLTextAreaElement, arquivoInput: HTMLInputElement): void {
    const texto = textarea.value.trim();
    const operacaoId = this.operacaoId();
    if (!texto || operacaoId === null) {
      return;
    }
    const arquivo = this.arquivoSelecionado();
    this.enviandoComentario.set(true);
    this.domainService
      .post({ entityName: ENTITY, body: { operacao_id: operacaoId, texto } })
      .subscribe({
        next: (criado) => {
          textarea.value = '';
          this.inserirComentarioLocal(criado.id, texto, operacaoId);
          if (!arquivo) {
            this.enviandoComentario.set(false);
            return;
          }
          this.documentsService.enviar(criado.id, arquivo).subscribe({
            next: (evento) => {
              if (evento.tipo === 'progresso') {
                const percentual = evento.total ? Math.round((evento.enviados / evento.total) * 100) : 0;
                this.progressoArquivo.set(percentual);
                return;
              }
              this.atualizarComentario(criado.id, { documentos: [evento.documento] });
            },
            error: (err: unknown) => {
              this.enviandoComentario.set(false);
              this.progressoArquivo.set(null);
              this.removerArquivoSelecionado(arquivoInput);
              this.toast.erro(`Comentário criado, mas não foi possível enviar o anexo: ${this.httpErrorMessage(err)}`);
            },
            complete: () => {
              this.enviandoComentario.set(false);
              this.progressoArquivo.set(null);
              this.removerArquivoSelecionado(arquivoInput);
            },
          });
        },
        error: (err: unknown) => {
          this.enviandoComentario.set(false);
          this.toast.erro(`Não foi possível adicionar o comentário: ${this.httpErrorMessage(err)}`);
        },
      });
  }

  private inserirComentarioLocal(id: number, texto: string, operacaoId: number): void {
    const usuario = this.auth.user();
    const novo: ComentarioView = {
      id,
      operacaoId,
      texto,
      autorId: usuario?.id ?? 0,
      criadoEm: new Date().toISOString(),
      autorNome: usuario?.name ?? '',
      documentos: [],
      carregandoDocumentos: false,
    };
    this.comentarios.update((lista) => [...lista, novo]);
    this.rolarParaUltimo();
  }

  /**
   * Leva a conversa pro fim (mensagem mais nova). O container rola em `column-reverse` (ver
   * `.operacao-comentario-card__mensagens` no SCSS), onde `scrollTop = 0` é o FUNDO — é isso que
   * mantém a conversa ancorada embaixo sozinha enquanto os anexos carregam depois.
   */
  private rolarParaUltimo(): void {
    const el = this.mensagensEl();
    if (el) {
      el.nativeElement.scrollTop = 0;
    }
  }

  protected alternarMenu(comentarioId: number, evento: MouseEvent): void {
    // Em `column-reverse` o que transborda pra BAIXO do container não é alcançável pelo scroll —
    // o menu do último balão sairia cortado. Sem espaço embaixo, abre pra cima.
    const toggle = evento.currentTarget as HTMLElement;
    const container = this.mensagensEl()?.nativeElement;
    if (container) {
      const espacoAbaixo = container.getBoundingClientRect().bottom - toggle.getBoundingClientRect().bottom;
      this.menuParaCima.set(espacoAbaixo < ALTURA_MENU_PX);
    }
    this.menuAbertoId.update((atual) => (atual === comentarioId ? null : comentarioId));
  }

  protected fecharMenu(): void {
    this.menuAbertoId.set(null);
  }

  /** Copia o texto já renderizado (sem `**`/`[](url)` do markdown) — é o que se cola num documento. */
  protected copiarTexto(elemento: HTMLElement): void {
    this.fecharMenu();
    const texto = elemento.innerText.trim();
    if (!texto || !navigator.clipboard) {
      return;
    }
    navigator.clipboard.writeText(texto).then(
      () => this.toast.sucesso('Texto copiado.'),
      () => this.toast.erro('Não foi possível copiar o texto.'),
    );
  }

  protected excluirComentario(comentario: ComentarioView): void {
    this.fecharMenu();
    this.comentarioParaExcluir.set(comentario);
  }

  protected cancelarExclusaoComentario(): void {
    if (this.excluindoComentario()) {
      return;
    }
    this.comentarioParaExcluir.set(null);
  }

  protected confirmarExclusaoComentario(): void {
    const comentario = this.comentarioParaExcluir();
    if (!comentario || this.excluindoComentario()) {
      return;
    }
    this.excluindoComentario.set(true);
    this.domainService.patch({ entityName: ENTITY, entityId: comentario.id, body: { ativo: false } }).subscribe({
      next: () => {
        this.excluindoComentario.set(false);
        this.comentarioParaExcluir.set(null);
        this.comentarios.update((lista) => lista.filter((c) => c.id !== comentario.id));
      },
      error: (err: unknown) => {
        this.excluindoComentario.set(false);
        this.toast.erro(`Não foi possível excluir o comentário: ${this.httpErrorMessage(err)}`);
      },
    });
  }

  protected excluirDocumento(comentario: ComentarioView, documento: Documento): void {
    this.anexoParaExcluir.set({ comentario, documento });
  }

  protected cancelarExclusaoAnexo(): void {
    if (this.excluindoAnexo()) {
      return;
    }
    this.anexoParaExcluir.set(null);
  }

  /** Diferente do comentário (soft-delete), o anexo é apagado de vez — por isso também pede confirmação. */
  protected confirmarExclusaoAnexo(): void {
    const alvo = this.anexoParaExcluir();
    if (!alvo || this.excluindoAnexo()) {
      return;
    }
    const { comentario, documento } = alvo;
    this.excluindoAnexo.set(true);
    this.documentsService.excluir(documento.id).subscribe({
      next: () => {
        this.excluindoAnexo.set(false);
        this.anexoParaExcluir.set(null);
        this.comentarios.update((lista) =>
          lista.map((c) =>
            c.id === comentario.id ? { ...c, documentos: c.documentos.filter((d) => d.id !== documento.id) } : c,
          ),
        );
      },
      error: (err: unknown) => {
        this.excluindoAnexo.set(false);
        this.toast.erro(`Não foi possível excluir o anexo: ${this.httpErrorMessage(err)}`);
      },
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
        // Busca os 500 MAIS NOVOS (se passar disso, corta os antigos, não os recentes)...
        sort: '-criadoEm',
        size: 500,
      })
      .subscribe({
        next: (pagina) => {
          // ...e inverte pra exibir estilo chat: mais antigo em cima, mais novo embaixo.
          this.comentarios.set(
            pagina.content
              .map((c) => ({
                ...c,
                autorNome: this.nomesAutores.get(c.autorId) ?? '',
                documentos: [],
                carregandoDocumentos: true,
              }))
              .reverse(),
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
