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
  untracked,
  viewChild,
} from '@angular/core';
import { Observable } from 'rxjs';

import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { AutoFocusSelectDirective } from '../../../../shared/directives/auto-focus-select.directive';
import { TIPOS_ACEITOS, DocumentsService } from '../../services/documents.service';
import { BreadcrumbItem, Documento, Pasta, PastaConteudo } from '../../models/document-explorer.model';

export type DocumentExplorerNoticeKey =
  | 'pastaCriada'
  | 'pastaCriadaErro'
  | 'renomeado'
  | 'renomeadoErro'
  | 'movidoErro'
  | 'excluido'
  | 'excluidoErro'
  | 'pastaNaoVazia'
  | 'uploadOk'
  | 'uploadErro'
  | 'downloadErro';

/** Aviso emitido para o rodapé de status do diálogo que hospeda o explorador (`clients.component`). */
export interface DocumentExplorerNotice {
  key: DocumentExplorerNoticeKey;
  subject?: string;
}

type TipoItem = 'pasta' | 'documento';
type ItemArrastado = { tipo: TipoItem; id: string; nome: string };

const TIPO_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Explorador de arquivos (pastas + documentos) de uma pessoa (cliente) — estilo gerenciador de
 * arquivos: navegação por pastas com breadcrumb, criar/renomear/excluir pasta, enviar/renomear/
 * mover/excluir/baixar documento, arrastar-e-soltar (mover item existente sobre uma pasta/
 * breadcrumb, ou soltar arquivos do SO para enviar). O binário nunca passa por aqui — só a URL
 * pré-assinada (`DocumentsService.enviar`/`downloadUrl`).
 */
@Component({
  selector: 'app-document-explorer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, ModalComponent, AutoFocusSelectDirective],
  templateUrl: './document-explorer.component.html',
  styleUrl: './document-explorer.component.scss',
})
export class DocumentExplorerComponent {
  private readonly documentsService = inject(DocumentsService);

  readonly pessoaId = input.required<number>();
  readonly notify = output<DocumentExplorerNotice>();

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  // --- preview de DOCX (renderizado no navegador com docx-preview; PDF abre em nova aba) ---
  protected readonly docxOpen = signal(false);
  protected readonly docxNome = signal('');
  protected readonly docxCarregando = signal(false);
  private readonly docxBlob = signal<Blob | null>(null);
  private readonly docxHost = viewChild<ElementRef<HTMLElement>>('docxHost');

  protected readonly pastaAtualId = signal<string | null>(null);
  protected readonly conteudo = signal<PastaConteudo | null>(null);
  protected readonly loading = signal(false);
  protected readonly enviandoQtd = signal(0);
  protected readonly dragOverAlvo = signal<string>(''); // id da pasta/breadcrumb sob o arrasto, '' = raiz, null = nenhum
  protected readonly dragOverAlvoAtivo = signal(false);
  protected readonly dragOverFundo = signal(false);

  /** Item com o nome em edição inline (nova pasta recém-criada, ou renomeação em andamento). */
  protected readonly itemEmEdicao = signal<{ tipo: TipoItem; id: string } | null>(null);

  protected readonly exclusaoAlvo = signal<{ tipo: TipoItem; id: string; nome: string } | null>(null);
  protected readonly exclusaoSalvando = signal(false);

  protected readonly menuAberto = signal<string | null>(null);
  /** Posição (fixa, relativa à viewport) do menu "..." aberto — calculada em `toggleMenu`. */
  protected readonly menuPos = signal<{ top: number | null; bottom: number | null; right: number } | null>(null);

  private itemArrastado: ItemArrastado | null = null;

  protected readonly subpastas = computed(() => this.conteudo()?.subpastas ?? []);
  protected readonly documentos = computed(() => this.conteudo()?.documentos ?? []);
  protected readonly breadcrumb = computed(() => this.conteudo()?.breadcrumb ?? []);
  protected readonly vazio = computed(
    () => !this.loading() && this.subpastas().length === 0 && this.documentos().length === 0,
  );

  constructor() {
    // `untracked` é essencial aqui: sem ele, a leitura de `pastaAtualId()` dentro de
    // `carregar()` vira dependência do efeito (por ter sido lida durante a execução dele),
    // e o efeito reagiria a toda navegação de pasta — resetando pastaAtualId pra null (raiz)
    // logo depois de `abrirPasta()` setá-lo, impedindo qualquer navegação pra dentro de pastas.
    effect(() => {
      this.pessoaId();
      untracked(() => {
        this.pastaAtualId.set(null);
        this.carregar();
      });
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

  private carregar(): void {
    this.loading.set(true);
    this.fecharMenu();
    this.itemEmEdicao.set(null);
    const pastaId = this.pastaAtualId();
    const req$ = pastaId ? this.documentsService.conteudo(pastaId) : this.documentsService.raiz(this.pessoaId());
    req$.subscribe({
      next: (conteudo) => {
        this.conteudo.set(conteudo);
        this.loading.set(false);
      },
      error: () => {
        this.conteudo.set({ breadcrumb: [], subpastas: [], documentos: [] });
        this.loading.set(false);
      },
    });
  }

  protected abrirPasta(pasta: Pasta): void {
    this.pastaAtualId.set(pasta.id);
    this.carregar();
  }

  protected irParaBreadcrumb(item: BreadcrumbItem | null): void {
    this.pastaAtualId.set(item?.id ?? null);
    this.carregar();
  }

  protected recarregar(): void {
    this.carregar();
  }

  // --- nova pasta / renomear (edição inline no nome da linha, estilo Windows Explorer) ---

  /** Cria a pasta já com um nome padrão e abre a edição inline pra o usuário digitar por cima. */
  protected criarPastaInline(): void {
    const nome = this.proximoNomePadrao();
    this.documentsService.criarPasta(this.pessoaId(), this.pastaAtualId(), nome).subscribe({
      next: (pasta) => {
        const atual = this.conteudo();
        if (atual) {
          const subpastas = [...atual.subpastas, pasta].sort((a, b) => a.nome.localeCompare(b.nome));
          this.conteudo.set({ ...atual, subpastas });
        }
        this.itemEmEdicao.set({ tipo: 'pasta', id: pasta.id });
      },
      error: (err: unknown) => this.notify.emit({ key: 'pastaCriadaErro', subject: this.mensagemErro(err) }),
    });
  }

  /** "Nova pasta", "Nova pasta (2)", "Nova pasta (3)"... evitando colidir com o nível atual (igual ao Windows). */
  private proximoNomePadrao(): string {
    const existentes = new Set(this.subpastas().map((pasta) => pasta.nome.toLowerCase()));
    if (!existentes.has('nova pasta')) {
      return 'Nova pasta';
    }
    let contador = 2;
    while (existentes.has(`nova pasta (${contador})`)) {
      contador += 1;
    }
    return `Nova pasta (${contador})`;
  }

  protected iniciarEdicaoInline(tipo: TipoItem, id: string): void {
    this.fecharMenu();
    this.itemEmEdicao.set({ tipo, id });
  }

  protected estaEditando(tipo: TipoItem, id: string): boolean {
    const atual = this.itemEmEdicao();
    return atual !== null && atual.tipo === tipo && atual.id === id;
  }

  /**
   * Confirma o nome digitado (Enter ou perda de foco). Sai da edição imediatamente, antes de
   * qualquer chamada de rede — evita que um `blur` disparado pela própria remoção do input (após
   * o Enter já ter processado) reenvie a mesma confirmação (a guarda de `itemEmEdicao` no topo
   * torna essa segunda chamada um no-op).
   */
  protected confirmarEdicaoInline(tipo: TipoItem, id: string, event: Event): void {
    const atual = this.itemEmEdicao();
    if (!atual || atual.tipo !== tipo || atual.id !== id) {
      return;
    }
    this.itemEmEdicao.set(null);

    const novoNome = (event.target as HTMLInputElement).value.trim();
    const nomeAtual = this.nomeAtualDoItem(tipo, id);
    if (!novoNome || novoNome === nomeAtual) {
      return;
    }
    const req$: Observable<Pasta | Documento> =
      tipo === 'pasta'
        ? this.documentsService.renomearPasta(id, novoNome)
        : this.documentsService.renomearDocumento(id, novoNome);
    req$.subscribe({
      next: () => this.carregar(),
      error: (err: unknown) => {
        this.carregar();
        this.notify.emit({ key: 'renomeadoErro', subject: this.mensagemErro(err) });
      },
    });
  }

  /** Esc: fecha a edição sem salvar (a pasta recém-criada mantém o nome padrão). */
  protected cancelarEdicaoInline(): void {
    this.itemEmEdicao.set(null);
  }

  private nomeAtualDoItem(tipo: TipoItem, id: string): string {
    const atual = this.conteudo();
    if (!atual) {
      return '';
    }
    return tipo === 'pasta'
      ? (atual.subpastas.find((pasta) => pasta.id === id)?.nome ?? '')
      : (atual.documentos.find((documento) => documento.id === id)?.nome ?? '');
  }

  // --- excluir ---

  protected abrirExclusao(tipo: TipoItem, id: string, nome: string): void {
    this.fecharMenu();
    this.exclusaoAlvo.set({ tipo, id, nome });
  }

  protected confirmarExclusao(): void {
    const alvo = this.exclusaoAlvo();
    if (!alvo || this.exclusaoSalvando()) {
      return;
    }
    this.exclusaoSalvando.set(true);
    const req$ =
      alvo.tipo === 'pasta'
        ? this.documentsService.excluirPasta(alvo.id)
        : this.documentsService.excluirDocumento(alvo.id);
    req$.subscribe({
      next: () => {
        this.exclusaoSalvando.set(false);
        this.exclusaoAlvo.set(null);
        this.carregar();
        this.notify.emit({ key: 'excluido', subject: alvo.nome });
      },
      error: (err: unknown) => {
        this.exclusaoSalvando.set(false);
        this.exclusaoAlvo.set(null);
        const status = (err as { status?: number })?.status;
        this.notify.emit(
          status === 409
            ? { key: 'pastaNaoVazia', subject: alvo.nome }
            : { key: 'excluidoErro', subject: this.mensagemErro(err) },
        );
      },
    });
  }

  protected cancelarExclusao(): void {
    if (this.exclusaoSalvando()) {
      return;
    }
    this.exclusaoAlvo.set(null);
  }

  // --- menu "..." por linha ---

  /**
   * Alterna o menu "..." e calcula sua posição em `position: fixed` (relativa à viewport, não ao
   * `<tr>`) — assim ele nunca fica cortado pelo `overflow: auto` da lista ou do modal, e abre pra
   * cima quando não há espaço suficiente embaixo do botão.
   */
  protected toggleMenu(id: string, event: MouseEvent): void {
    if (this.menuAberto() === id) {
      this.fecharMenu();
      return;
    }
    const botao = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const alturaEstimadaMenu = 200;
    const cabeEmbaixo = window.innerHeight - botao.bottom >= alturaEstimadaMenu;
    this.menuPos.set({
      top: cabeEmbaixo ? botao.bottom + 4 : null,
      bottom: cabeEmbaixo ? null : window.innerHeight - botao.top + 4,
      right: window.innerWidth - botao.right,
    });
    this.menuAberto.set(id);
  }

  protected fecharMenu(): void {
    this.menuAberto.set(null);
    this.menuPos.set(null);
  }

  protected onClickNoExplorador(event: MouseEvent): void {
    const alvo = event.target as HTMLElement | null;
    if (this.menuAberto() && !alvo?.closest('.doc-explorer__row-menu')) {
      this.fecharMenu();
    }
  }

  /** Atalho do menu: sobe o item um nível (pra pasta-pai da pasta atual, ou raiz). */
  protected moverParaPastaPai(tipo: TipoItem, id: string): void {
    this.fecharMenu();
    const caminho = this.breadcrumb();
    const novaPastaPaiId = caminho.length >= 2 ? caminho[caminho.length - 2].id : null;
    this.mover(tipo, id, novaPastaPaiId);
  }

  private mover(tipo: TipoItem, id: string, destinoId: string | null): void {
    const removido = this.removerItemLocal(tipo, id);
    const req$: Observable<Pasta | Documento> =
      tipo === 'pasta'
        ? this.documentsService.moverPasta(id, destinoId)
        : this.documentsService.moverDocumento(id, destinoId);
    req$.subscribe({
      error: (err: unknown) => {
        if (removido) {
          this.restaurarItemLocal(tipo, removido);
        }
        this.notify.emit({ key: 'movidoErro', subject: this.mensagemErro(err) });
      },
    });
  }

  private removerItemLocal(tipo: TipoItem, id: string): Pasta | Documento | null {
    const atual = this.conteudo();
    if (!atual) {
      return null;
    }
    if (tipo === 'pasta') {
      const item = atual.subpastas.find((pasta) => pasta.id === id) ?? null;
      if (item) {
        this.conteudo.set({ ...atual, subpastas: atual.subpastas.filter((pasta) => pasta.id !== id) });
      }
      return item;
    }
    const item = atual.documentos.find((documento) => documento.id === id) ?? null;
    if (item) {
      this.conteudo.set({ ...atual, documentos: atual.documentos.filter((documento) => documento.id !== id) });
    }
    return item;
  }

  private restaurarItemLocal(tipo: TipoItem, item: Pasta | Documento): void {
    const atual = this.conteudo();
    if (!atual) {
      return;
    }
    if (tipo === 'pasta') {
      const subpastas = [...atual.subpastas, item as Pasta].sort((a, b) => a.nome.localeCompare(b.nome));
      this.conteudo.set({ ...atual, subpastas });
    } else {
      const documentos = [...atual.documentos, item as Documento].sort((a, b) => a.nome.localeCompare(b.nome));
      this.conteudo.set({ ...atual, documentos });
    }
  }

  // --- upload ---

  protected abrirSeletorArquivo(): void {
    this.fileInput()?.nativeElement.click();
  }

  protected onArquivoEscolhido(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.enviarArquivos(input.files, this.pastaAtualId());
    }
    input.value = '';
  }

  private enviarArquivos(arquivos: FileList, pastaDestinoId: string | null): void {
    Array.from(arquivos).forEach((arquivo) => this.enviarArquivo(arquivo, pastaDestinoId));
  }

  private enviarArquivo(arquivo: File, pastaDestinoId: string | null): void {
    if (!TIPOS_ACEITOS.includes(arquivo.type)) {
      this.notify.emit({ key: 'uploadErro', subject: `${arquivo.name}: formato não permitido` });
      return;
    }
    this.enviandoQtd.update((n) => n + 1);
    this.documentsService.enviar(this.pessoaId(), pastaDestinoId, arquivo).subscribe({
      next: () => {
        this.enviandoQtd.update((n) => n - 1);
        if (this.pastaAtualId() === pastaDestinoId) {
          this.carregar();
        }
        this.notify.emit({ key: 'uploadOk', subject: arquivo.name });
      },
      error: (err: unknown) => {
        this.enviandoQtd.update((n) => n - 1);
        this.notify.emit({ key: 'uploadErro', subject: `${arquivo.name}: ${this.mensagemErro(err)}` });
      },
    });
  }

  // --- download / visualizar ---

  protected baixar(documento: Documento): void {
    this.fecharMenu();
    this.documentsService.downloadUrl(documento.id).subscribe({
      next: (url) => {
        const link = document.createElement('a');
        link.href = url;
        link.click();
      },
      error: () => this.notify.emit({ key: 'downloadErro', subject: documento.nome }),
    });
  }

  /** PDF e DOCX têm o ícone de olho na linha — o resto (imagens) só tem baixar. */
  protected podeVisualizar(documento: Documento): boolean {
    return documento.contentType === 'application/pdf' || documento.contentType === TIPO_DOCX;
  }

  protected visualizar(documento: Documento): void {
    this.fecharMenu();
    if (documento.contentType === TIPO_DOCX) {
      this.visualizarDocx(documento);
      return;
    }
    this.visualizarPdf(documento);
  }

  /** Abre a aba já no clique (gesto do usuário) pra não cair no bloqueador de pop-up; a URL do
   * blob é setada quando o download termina. */
  private visualizarPdf(documento: Documento): void {
    const aba = window.open('', '_blank');
    this.documentsService.baixarBlob(documento.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
        if (aba) {
          aba.location.href = url;
        } else {
          window.open(url, '_blank');
        }
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: () => {
        aba?.close();
        this.notify.emit({ key: 'downloadErro', subject: documento.nome });
      },
    });
  }

  /** Baixa o DOCX e abre o modal de preview — o `effect` do construtor chama o docx-preview quando o container monta. */
  private visualizarDocx(documento: Documento): void {
    this.docxNome.set(documento.nome);
    this.docxCarregando.set(true);
    this.docxOpen.set(true);
    this.documentsService.baixarBlob(documento.id).subscribe({
      next: (blob) => this.docxBlob.set(blob),
      error: () => {
        this.docxCarregando.set(false);
        this.docxOpen.set(false);
        this.notify.emit({ key: 'downloadErro', subject: documento.nome });
      },
    });
  }

  private async renderizarDocx(host: HTMLElement, blob: Blob): Promise<void> {
    this.docxCarregando.set(true);
    host.replaceChildren();
    try {
      const { renderAsync } = await import('docx-preview');
      await renderAsync(blob, host, undefined, { ignoreLastRenderedPageBreak: true });
    } catch {
      this.notify.emit({ key: 'downloadErro', subject: this.docxNome() });
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

  // --- arrastar e soltar ---

  protected onDragStartPasta(event: DragEvent, pasta: Pasta): void {
    this.itemArrastado = { tipo: 'pasta', id: pasta.id, nome: pasta.nome };
    event.dataTransfer?.setData('text/plain', pasta.id);
  }

  protected onDragStartDocumento(event: DragEvent, documento: Documento): void {
    this.itemArrastado = { tipo: 'documento', id: documento.id, nome: documento.nome };
    event.dataTransfer?.setData('text/plain', documento.id);
  }

  protected onDragEnd(): void {
    this.itemArrastado = null;
    this.dragOverAlvoAtivo.set(false);
  }

  protected onDragOverAlvo(event: DragEvent, alvoId: string): void {
    if (this.itemArrastado && this.itemArrastado.tipo === 'pasta' && this.itemArrastado.id === alvoId) {
      return;
    }
    event.preventDefault();
    this.dragOverAlvo.set(alvoId);
    this.dragOverAlvoAtivo.set(true);
  }

  protected onDragLeaveAlvo(alvoId: string): void {
    if (this.dragOverAlvo() === alvoId) {
      this.dragOverAlvoAtivo.set(false);
    }
  }

  protected onDropNaPasta(event: DragEvent, pasta: Pasta): void {
    event.preventDefault();
    this.dragOverAlvoAtivo.set(false);
    if (event.dataTransfer?.files.length) {
      this.enviarArquivos(event.dataTransfer.files, pasta.id);
      return;
    }
    if (this.itemArrastado && !(this.itemArrastado.tipo === 'pasta' && this.itemArrastado.id === pasta.id)) {
      this.mover(this.itemArrastado.tipo, this.itemArrastado.id, pasta.id);
    }
    this.itemArrastado = null;
  }

  protected onDropNoBreadcrumb(event: DragEvent, item: BreadcrumbItem | null): void {
    event.preventDefault();
    this.dragOverAlvoAtivo.set(false);
    if (this.itemArrastado) {
      this.mover(this.itemArrastado.tipo, this.itemArrastado.id, item?.id ?? null);
    }
    this.itemArrastado = null;
  }

  /** Fundo da lista (fora de qualquer linha): só aceita arquivos do SO — enviados na pasta atual. */
  protected onDragOverFundo(event: DragEvent): void {
    if (event.dataTransfer?.types.includes('Files')) {
      event.preventDefault();
      this.dragOverFundo.set(true);
    }
  }

  protected onDragLeaveFundo(): void {
    this.dragOverFundo.set(false);
  }

  protected onDropFundo(event: DragEvent): void {
    event.preventDefault();
    this.dragOverFundo.set(false);
    if (event.dataTransfer?.files.length) {
      this.enviarArquivos(event.dataTransfer.files, this.pastaAtualId());
    }
  }

  protected estaSobAlvo(alvoId: string): boolean {
    return this.dragOverAlvoAtivo() && this.dragOverAlvo() === alvoId;
  }

  // --- utilidades ---

  protected iconeDocumento(documento: Documento): string {
    const tipo = documento.contentType ?? '';
    if (tipo === 'application/pdf') {
      return 'fa-solid fa-file-pdf';
    }
    if (tipo.startsWith('image/')) {
      return 'fa-solid fa-file-image';
    }
    if (tipo === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return 'fa-solid fa-file-word';
    }
    return 'fa-solid fa-file';
  }

  protected formatarTamanho(bytes: number | null): string {
    if (bytes === null) {
      return '-';
    }
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    const kb = bytes / 1024;
    return kb < 1024 ? `${kb.toFixed(kb < 10 ? 1 : 0)} KB` : `${(kb / 1024).toFixed(1)} MB`;
  }

  protected formatarData(data: Date): string {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(data);
  }

  private mensagemErro(err: unknown): string {
    const e = err as {
      error?: { detail?: string; title?: string; message?: string };
      message?: string;
      status?: number;
    };
    if (e?.status === 0) {
      return 'Sem conexão com o servidor.';
    }
    return (
      e?.error?.detail || e?.error?.title || e?.error?.message || e?.message || 'Não foi possível concluir a operação.'
    );
  }
}
