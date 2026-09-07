import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Observable } from 'rxjs';

import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { AutoFocusSelectDirective } from '../../../../shared/directives/auto-focus-select.directive';
import { formatFileSize } from '../../../../shared/utils/format-file-size';
import { DocxRenderDirective } from '../../directives/docx-render.directive';
import { DocumentsService, resolverTipoAceito } from '../../services/documents.service';
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
  | 'downloadErro'
  | 'editarIndisponivel'
  | 'editarErro';

/** Aviso emitido para o rodapé de status do diálogo que hospeda o explorador (`clients.component`). */
export interface DocumentExplorerNotice {
  key: DocumentExplorerNoticeKey;
  subject?: string;
}

type TipoItem = 'pasta' | 'documento';
type ItemArrastado = { tipo: TipoItem; id: string; nome: string };

/** Chave de item na seleção: `pasta:<id>` ou `doc:<id>` (mesmo formato do `menuAberto`). */
type ChaveItem = string;

const chaveDe = (tipo: TipoItem, id: string): ChaveItem => `${tipo === 'pasta' ? 'pasta' : 'doc'}:${id}`;

/** Uma janela flutuante de preview (ver `janelas` no componente). */
interface JanelaPreview {
  /** id do documento — reabrir o mesmo arquivo foca a janela existente em vez de duplicar. */
  id: string;
  nome: string;
  modo: 'docx' | 'pdf' | 'imagem';
  carregando: boolean;
  /** Object URL (pdf/imagem); revogada ao fechar. */
  url: string | null;
  urlSafe: SafeResourceUrl | null;
  docxBlob: Blob | null;
  estado: 'normal' | 'minimizada' | 'maximizada';
  pos: { x: number; y: number };
  tam: { w: number; h: number };
  z: number;
}

const TIPO_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Protocolo de URI que os apps desktop do Office registram no SO (o mesmo que o botão "Abrir na
 * área de trabalho" do Office Online usa por trás dos panos). Só `.docx` tem editor online
 * (Word Online) hoje; `.xlsx`/`.pptx` no futuro é só estender este mapa e o backend.
 *
 * Usamos a forma **abreviada** (`ms-word:<url>`), não a completa (`ms-word:ofe|u|<url>`): a
 * completa exige a URL numa zona Confiável/Intranet do Windows e recusa link do OneDrive pessoal
 * com "conteúdo não seguro / zona Sites Restritos"; a abreviada abre em modo protegido (o usuário
 * clica "Habilitar Edição") sem essa checagem. Ver Office URI Schemes.
 */
const PROTOCOLO_DESKTOP_POR_CONTENT_TYPE: Record<string, string> = {
  [TIPO_DOCX]: 'ms-word',
};

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
  imports: [ButtonComponent, ModalComponent, AutoFocusSelectDirective, DocxRenderDirective],
  templateUrl: './document-explorer.component.html',
  styleUrl: './document-explorer.component.scss',
  host: {
    '(document:keydown.delete)': 'onTeclaDelete($event)',
  },
})
export class DocumentExplorerComponent {
  private readonly documentsService = inject(DocumentsService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly pessoaId = input.required<number>();
  /** Nome do cliente — rotula a raiz do breadcrumb (a "raiz" aqui é a pasta-mãe desse cliente, não algo global). */
  readonly pessoaNome = input<string>('');
  readonly notify = output<DocumentExplorerNotice>();

  protected readonly rotuloRaiz = computed(() => this.pessoaNome().trim() || 'Início');

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  /**
   * Janelas de preview abertas — cada arquivo abre a sua (arrastável, redimensionável, min/max).
   * DOCX vira HTML via `appDocxRender`; PDF/imagem viram Object URL num `<iframe>`/`<img>`.
   */
  protected readonly janelas = signal<JanelaPreview[]>([]);
  /** Base acima de `$z-overlay` (200) pras janelas ficarem sobre o modal da pasta; sobe a cada foco. */
  private zSeq = 260;
  private janelaDrag: { j: JanelaPreview; mx: number; my: number; ox: number; oy: number } | null = null;
  private janelaResize: { j: JanelaPreview; mx: number; my: number; ow: number; oh: number } | null = null;

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

  // --- seleção múltipla (estilo Windows Explorer) ---
  private readonly listaEl = viewChild<ElementRef<HTMLElement>>('lista');
  protected readonly selecao = signal<ReadonlySet<ChaveItem>>(new Set());
  /** Última linha clicada sem Ctrl — origem do intervalo do Shift+clique. */
  private ancoraSelecao: ChaveItem | null = null;
  /** Retângulo de arrasto (rubber-band) em coordenadas de viewport, ou `null` quando inativo. */
  protected readonly retangulo = signal<{ x: number; y: number; w: number; h: number } | null>(null);
  private rubberBand: { origemX: number; origemY: number; base: ReadonlySet<ChaveItem>; moveu: boolean } | null = null;
  /** `true` enquanto o drag nativo carrega a seleção inteira (mais de um item). */
  private arrastandoSelecao = false;
  /** Itens marcados para exclusão em lote (barra de seleção), ou `null`. */
  protected readonly exclusaoLote = signal<ItemArrastado[] | null>(null);

  protected readonly subpastas = computed(() => this.conteudo()?.subpastas ?? []);
  protected readonly documentos = computed(() => this.conteudo()?.documentos ?? []);
  protected readonly breadcrumb = computed(() => this.conteudo()?.breadcrumb ?? []);
  protected readonly vazio = computed(
    () => !this.loading() && this.subpastas().length === 0 && this.documentos().length === 0,
  );
  protected readonly qtdSelecionada = computed(() => this.selecao().size);

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

    // Solta os listeners globais (rubber-band / arrasto da janela) e revoga as Object URLs.
    inject(DestroyRef).onDestroy(() => {
      this.pararRubberBand();
      this.onJanelaFim();
      this.janelas().forEach((j) => {
        if (j.url) {
          URL.revokeObjectURL(j.url);
        }
      });
    });
  }

  private carregar(): void {
    this.loading.set(true);
    this.fecharMenu();
    this.itemEmEdicao.set(null);
    this.limparSelecao();
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
    if (this.exclusaoSalvando()) {
      return;
    }
    const lote = this.exclusaoLote();
    if (lote) {
      this.excluirLote(lote);
      return;
    }
    const alvo = this.exclusaoAlvo();
    if (!alvo) {
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
    this.exclusaoLote.set(null);
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
    const tipo = resolverTipoAceito(arquivo);
    if (!tipo) {
      this.notify.emit({ key: 'uploadErro', subject: `${arquivo.name}: formato não permitido` });
      return;
    }
    // Reembala com o content-type resolvido quando o navegador não reportou (ou reportou errado) —
    // senão o backend recebe um MIME vazio/genérico e rejeita mesmo sendo um formato aceito.
    const arquivoTipado = arquivo.type === tipo ? arquivo : new File([arquivo], arquivo.name, { type: tipo });
    this.enviandoQtd.update((n) => n + 1);
    this.documentsService.enviar(this.pessoaId(), pastaDestinoId, arquivoTipado).subscribe({
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

  /** Baixa a pasta (com subpastas e documentos, recursivamente) como um `.zip`. */
  protected baixarPastaZip(pasta: Pasta): void {
    this.fecharMenu();
    this.documentsService.baixarPastaZip(pasta.id).subscribe({
      next: (blob) => this.salvarBlob(blob, `${pasta.nome}.zip`),
      error: () => this.notify.emit({ key: 'downloadErro', subject: pasta.nome }),
    });
  }

  /** Baixa a seleção (pastas e/ou documentos) como um único `.zip`. */
  protected baixarSelecaoZip(): void {
    const itens = this.itensSelecionados();
    const pastaIds = itens.filter((i) => i.tipo === 'pasta').map((i) => i.id);
    const documentoIds = itens.filter((i) => i.tipo === 'documento').map((i) => i.id);
    if (pastaIds.length === 0 && documentoIds.length === 0) {
      return;
    }
    const nome =
      pastaIds.length === 1 && documentoIds.length === 0 ? itens[0].nome : 'arquivos';
    this.documentsService.baixarSelecaoZip(pastaIds, documentoIds).subscribe({
      next: (blob) => this.salvarBlob(blob, `${nome}.zip`),
      error: () => this.notify.emit({ key: 'downloadErro', subject: nome }),
    });
  }

  private salvarBlob(blob: Blob, nomeArquivo: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nomeArquivo;
    link.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Abre o documento no editor da nuvem (Word/Excel/PowerPoint Online) numa nova aba — só quando o
   * provedor de armazenamento ativo suportar (hoje só OneDrive; local/S3 devolvem `null`).
   */
  protected editarOnline(documento: Documento): void {
    this.fecharMenu();
    // Abre a aba já no clique (gesto do usuário) pra não cair no bloqueador de pop-up.
    const aba = window.open('', '_blank');
    this.documentsService.editUrl(documento.id).subscribe({
      next: (url) => {
        if (!url) {
          aba?.close();
          this.notify.emit({ key: 'editarIndisponivel', subject: documento.nome });
          return;
        }
        if (aba) {
          aba.location.href = url;
        } else {
          window.open(url, '_blank');
        }
      },
      error: () => {
        aba?.close();
        this.notify.emit({ key: 'editarErro', subject: documento.nome });
      },
    });
  }

  /** Só tipos com app desktop do Office registrado (hoje só `.docx`, ver `TIPOS_ACEITOS`). */
  protected podeAbrirNoDesktop(documento: Documento): boolean {
    return !!documento.contentType && documento.contentType in PROTOCOLO_DESKTOP_POR_CONTENT_TYPE;
  }

  /**
   * Pula direto pro app desktop do Office, sem passar pela versão web — usa o mesmo link do Graph
   * que `editarOnline` usa, só que endereçado ao protocolo do app instalado no SO, na forma
   * abreviada `ms-word:<url>` (ver `PROTOCOLO_DESKTOP_POR_CONTENT_TYPE` sobre por que não a
   * completa `ofe|u|`). O navegador mostra o próprio prompt nativo de "abrir aplicativo?"; não
   * precisa de aba nova nem de gesto especial além do clique que já dispara isto.
   */
  protected editarNoDesktop(documento: Documento): void {
    this.fecharMenu();
    const protocolo = documento.contentType ? PROTOCOLO_DESKTOP_POR_CONTENT_TYPE[documento.contentType] : undefined;
    if (!protocolo) {
      return;
    }
    this.documentsService.editUrl(documento.id).subscribe({
      next: (url) => {
        if (!url) {
          this.notify.emit({ key: 'editarIndisponivel', subject: documento.nome });
          return;
        }
        // Forma abreviada: a URL vai crua (`:` e `/` não são delimitadores aqui, ver spec).
        window.location.href = `${protocolo}:${url}`;
      },
      error: () => this.notify.emit({ key: 'editarErro', subject: documento.nome }),
    });
  }

  /** PDF, imagens (jpeg/png) e DOCX têm preview; o resto (doc/odt/xls/xlsx) só baixa. */
  protected podeVisualizar(documento: Documento): boolean {
    const tipo = documento.contentType ?? '';
    return tipo === 'application/pdf' || tipo === TIPO_DOCX || tipo.startsWith('image/');
  }

  /** Duplo clique numa linha de documento: abre o preview quando o tipo suporta. */
  protected onDuploCliqueDocumento(documento: Documento): void {
    if (this.podeVisualizar(documento)) {
      this.visualizar(documento);
    }
  }

  protected visualizar(documento: Documento): void {
    this.fecharMenu();
    const tipo = documento.contentType ?? '';
    if (tipo === TIPO_DOCX) {
      this.abrirPreview(documento, 'docx');
    } else if (tipo === 'application/pdf') {
      this.abrirPreview(documento, 'pdf');
    } else if (tipo.startsWith('image/')) {
      this.abrirPreview(documento, 'imagem');
    }
  }

  /**
   * Abre uma janela flutuante pro documento (ou foca a que já estiver aberta pra ele). DOCX
   * renderiza via `appDocxRender`; PDF/imagem viram Object URL num `<iframe>`/`<img>`.
   */
  private abrirPreview(documento: Documento, modo: 'docx' | 'pdf' | 'imagem'): void {
    const existente = this.janelas().find((j) => j.id === documento.id);
    if (existente) {
      if (existente.estado === 'minimizada') {
        existente.estado = 'normal';
      }
      this.focar(existente);
      return;
    }

    const w = 900;
    const h = Math.min(680, window.innerHeight - 40);
    const desloc = this.janelas().length * 28;
    const j: JanelaPreview = {
      id: documento.id,
      nome: documento.nome,
      modo,
      carregando: true,
      url: null,
      urlSafe: null,
      docxBlob: null,
      estado: 'normal',
      pos: {
        x: Math.max(8, Math.round((window.innerWidth - w) / 2) + desloc),
        y: Math.max(8, Math.round((window.innerHeight - h) / 2) + desloc),
      },
      tam: { w, h },
      z: ++this.zSeq,
    };
    this.janelas.update((a) => [...a, j]);

    this.documentsService.baixarBlob(documento.id).subscribe({
      next: (blob) => {
        if (modo === 'docx') {
          j.docxBlob = blob;
        } else {
          const mime =
            documento.contentType || blob.type || (modo === 'pdf' ? 'application/pdf' : 'application/octet-stream');
          j.url = URL.createObjectURL(new Blob([blob], { type: mime }));
          j.urlSafe = this.sanitizer.bypassSecurityTrustResourceUrl(j.url);
          j.carregando = false;
        }
        this.bump();
      },
      error: () => {
        this.fechar(j);
        this.notify.emit({ key: 'downloadErro', subject: documento.nome });
      },
    });
  }

  /** Notifica o template de uma mutação feita direto num objeto de `janelas` (pos, estado, z...). */
  protected bump(): void {
    this.janelas.update((a) => [...a]);
  }

  protected fechar(j: JanelaPreview): void {
    if (j.url) {
      URL.revokeObjectURL(j.url);
    }
    this.janelas.update((a) => a.filter((x) => x !== j));
  }

  protected onDocxFalhou(j: JanelaPreview): void {
    this.notify.emit({ key: 'downloadErro', subject: j.nome });
    this.fechar(j);
  }

  /** Índice da janela entre as minimizadas — empilha as barrinhas no canto (ver `--min-i` no SCSS). */
  protected minIndex(j: JanelaPreview): number {
    return this.janelas()
      .filter((w) => w.estado === 'minimizada')
      .indexOf(j);
  }

  // --- janela flutuante: foco / arrastar / redimensionar / max-restaurar ---

  protected focar(j: JanelaPreview): void {
    const maxZ = Math.max(0, ...this.janelas().map((w) => w.z));
    if (j.z < maxZ) {
      j.z = ++this.zSeq;
      this.bump();
    }
  }

  protected janelaMaxRestaurar(j: JanelaPreview): void {
    j.estado = j.estado === 'maximizada' ? 'normal' : 'maximizada';
    this.bump();
  }

  /** Clicar na barra de uma janela minimizada restaura pro tamanho normal (fora dos botões). */
  protected onJanelaBarClick(event: MouseEvent, j: JanelaPreview): void {
    if (j.estado === 'minimizada' && !(event.target as HTMLElement).closest('button')) {
      j.estado = 'normal';
      this.focar(j);
      this.bump();
    }
  }

  protected onJanelaDragStart(event: MouseEvent, j: JanelaPreview): void {
    if (j.estado !== 'normal' || event.button !== 0 || (event.target as HTMLElement).closest('button')) {
      return;
    }
    event.preventDefault();
    this.janelaDrag = { j, mx: event.clientX, my: event.clientY, ox: j.pos.x, oy: j.pos.y };
    window.addEventListener('mousemove', this.onJanelaDragMove);
    window.addEventListener('mouseup', this.onJanelaFim);
  }

  private readonly onJanelaDragMove = (event: MouseEvent): void => {
    const d = this.janelaDrag;
    if (!d) {
      return;
    }
    d.j.pos = {
      x: Math.min(Math.max(0, d.ox + event.clientX - d.mx), window.innerWidth - 140),
      y: Math.min(Math.max(0, d.oy + event.clientY - d.my), window.innerHeight - 36),
    };
    this.bump();
  };

  protected onJanelaResizeStart(event: MouseEvent, j: JanelaPreview): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.janelaResize = { j, mx: event.clientX, my: event.clientY, ow: j.tam.w, oh: j.tam.h };
    window.addEventListener('mousemove', this.onJanelaResizeMove);
    window.addEventListener('mouseup', this.onJanelaFim);
  }

  private readonly onJanelaResizeMove = (event: MouseEvent): void => {
    const r = this.janelaResize;
    if (!r) {
      return;
    }
    r.j.tam = {
      w: Math.max(360, Math.min(r.ow + event.clientX - r.mx, window.innerWidth - r.j.pos.x)),
      h: Math.max(220, Math.min(r.oh + event.clientY - r.my, window.innerHeight - r.j.pos.y)),
    };
    this.bump();
  };

  private readonly onJanelaFim = (): void => {
    window.removeEventListener('mousemove', this.onJanelaDragMove);
    window.removeEventListener('mousemove', this.onJanelaResizeMove);
    window.removeEventListener('mouseup', this.onJanelaFim);
    this.janelaDrag = null;
    this.janelaResize = null;
  };

  // --- seleção múltipla ---

  protected chaveItem(tipo: TipoItem, id: string): ChaveItem {
    return chaveDe(tipo, id);
  }

  protected estaSelecionado(tipo: TipoItem, id: string): boolean {
    return this.selecao().has(chaveDe(tipo, id));
  }

  protected limparSelecao(): void {
    if (this.selecao().size > 0) {
      this.selecao.set(new Set());
    }
    this.ancoraSelecao = null;
  }

  /** Todas as chaves na ordem em que as linhas aparecem — base do intervalo do Shift+clique. */
  private get ordemLinear(): ChaveItem[] {
    return [
      ...this.subpastas().map((p) => chaveDe('pasta', p.id)),
      ...this.documentos().map((d) => chaveDe('documento', d.id)),
    ];
  }

  private itensSelecionados(): ItemArrastado[] {
    const sel = this.selecao();
    const itens: ItemArrastado[] = [];
    for (const p of this.subpastas()) {
      if (sel.has(chaveDe('pasta', p.id))) itens.push({ tipo: 'pasta', id: p.id, nome: p.nome });
    }
    for (const d of this.documentos()) {
      if (sel.has(chaveDe('documento', d.id))) itens.push({ tipo: 'documento', id: d.id, nome: d.nome });
    }
    return itens;
  }

  /**
   * Clique numa linha. Sem modificador: seleciona só ela. Ctrl/Cmd: alterna. Shift: intervalo a
   * partir da âncora (Ctrl+Shift acumula no que já estava selecionado). Ignora o clique quando
   * saiu de um controle da linha (menu, olho, input) — esses fazem `stopPropagation`.
   */
  protected onCliqueLinha(tipo: TipoItem, id: string, event: MouseEvent): void {
    this.fecharMenu();
    const chave = chaveDe(tipo, id);
    const multi = event.ctrlKey || event.metaKey;

    if (event.shiftKey && this.ancoraSelecao) {
      const ordem = this.ordemLinear;
      const i = ordem.indexOf(this.ancoraSelecao);
      const j = ordem.indexOf(chave);
      if (i !== -1 && j !== -1) {
        const [lo, hi] = i < j ? [i, j] : [j, i];
        const intervalo = ordem.slice(lo, hi + 1);
        this.selecao.set(multi ? new Set([...this.selecao(), ...intervalo]) : new Set(intervalo));
        return;
      }
    }

    if (multi) {
      const nova = new Set(this.selecao());
      if (nova.has(chave)) {
        nova.delete(chave);
      } else {
        nova.add(chave);
      }
      this.selecao.set(nova);
      this.ancoraSelecao = chave;
      return;
    }

    this.selecao.set(new Set([chave]));
    this.ancoraSelecao = chave;
  }

  // --- seleção por retângulo (rubber-band) ---

  /** Só inicia quando o `mousedown` (botão esquerdo) cai no fundo da lista, não numa linha/controle. */
  protected onMouseDownLista(event: MouseEvent): void {
    if (event.button !== 0) return;
    const alvo = event.target as HTMLElement | null;
    if (alvo?.closest('tr, button, input, a, .doc-explorer__menu')) return;

    this.fecharMenu();
    this.rubberBand = {
      origemX: event.clientX,
      origemY: event.clientY,
      base: event.ctrlKey || event.metaKey ? this.selecao() : new Set(),
      moveu: false,
    };
    window.addEventListener('mousemove', this.onMouseMoveRubberBand);
    window.addEventListener('mouseup', this.onMouseUpRubberBand);
  }

  private readonly onMouseMoveRubberBand = (event: MouseEvent): void => {
    const rb = this.rubberBand;
    if (!rb) return;
    const x = Math.min(event.clientX, rb.origemX);
    const y = Math.min(event.clientY, rb.origemY);
    const w = Math.abs(event.clientX - rb.origemX);
    const h = Math.abs(event.clientY - rb.origemY);
    if (!rb.moveu && w + h < 5) return; // tolera o tremor de um clique
    rb.moveu = true;
    this.retangulo.set({ x, y, w, h });

    const lista = this.listaEl()?.nativeElement;
    if (!lista) return;
    const nova = new Set(rb.base);
    lista.querySelectorAll<HTMLElement>('tr[data-chave]').forEach((tr) => {
      const r = tr.getBoundingClientRect();
      const cruza = r.left < x + w && r.right > x && r.top < y + h && r.bottom > y;
      if (cruza) nova.add(tr.dataset['chave']!);
    });
    this.selecao.set(nova);
  };

  private readonly onMouseUpRubberBand = (): void => {
    const moveu = this.rubberBand?.moveu ?? false;
    this.pararRubberBand();
    if (!moveu) {
      this.limparSelecao(); // clique simples no vazio = limpa
    }
  };

  private pararRubberBand(): void {
    window.removeEventListener('mousemove', this.onMouseMoveRubberBand);
    window.removeEventListener('mouseup', this.onMouseUpRubberBand);
    this.rubberBand = null;
    this.retangulo.set(null);
  }

  // --- ações em lote ---

  /** Move a seleção pra pasta-pai da pasta atual (mesma lógica de `moverParaPastaPai`). */
  protected moverSelecaoParaPastaPai(): void {
    const caminho = this.breadcrumb();
    const destino = caminho.length >= 2 ? caminho[caminho.length - 2].id : null;
    this.moverSelecionados(destino);
  }

  private moverSelecionados(destinoId: string | null): void {
    const itens = this.itensSelecionados().filter((i) => !(i.tipo === 'pasta' && i.id === destinoId));
    if (itens.length === 0) return;
    const total = itens.length;
    let pendentes = total;
    let falhas = 0;
    this.limparSelecao();
    for (const item of itens) {
      this.removerItemLocal(item.tipo, item.id);
      const req$: Observable<Pasta | Documento> =
        item.tipo === 'pasta'
          ? this.documentsService.moverPasta(item.id, destinoId)
          : this.documentsService.moverDocumento(item.id, destinoId);
      req$.subscribe({
        next: () => this.aoConcluirLoteMover(--pendentes, total, falhas),
        error: () => this.aoConcluirLoteMover(--pendentes, total, (falhas += 1)),
      });
    }
  }

  private aoConcluirLoteMover(pendentes: number, total: number, falhas: number): void {
    if (pendentes > 0) return;
    if (falhas > 0) {
      this.notify.emit({ key: 'movidoErro', subject: `${falhas} de ${total} item(ns)` });
      this.carregar(); // ressincroniza: itens removidos localmente cujo move falhou voltam
    }
  }

  protected abrirExclusaoLote(): void {
    this.exclusaoLote.set(this.itensSelecionados());
  }

  /** Tecla Delete: abre a confirmação de exclusão da seleção (nunca apaga direto). */
  protected onTeclaDelete(event: Event): void {
    if (this.selecao().size === 0 || this.itemEmEdicao()) {
      return;
    }
    // não interfere quando o foco está num campo de texto nem com um diálogo já aberto
    const alvo = event.target as HTMLElement | null;
    if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable)) {
      return;
    }
    // janelas de preview minimizadas não bloqueiam o Delete do explorador
    const previewAtivo = this.janelas().some((j) => j.estado !== 'minimizada');
    if (this.exclusaoAlvo() || this.exclusaoLote() || previewAtivo) {
      return;
    }
    event.preventDefault();
    this.abrirExclusaoLote();
  }

  private excluirLote(itens: ItemArrastado[]): void {
    this.exclusaoSalvando.set(true);
    const total = itens.length;
    let pendentes = total;
    let falhas = 0;
    let naoVazias = 0;
    const feito = (): void => {
      if (pendentes > 0) return;
      this.exclusaoSalvando.set(false);
      this.exclusaoLote.set(null);
      this.limparSelecao();
      this.carregar();
      const ok = total - falhas - naoVazias;
      if (ok > 0) this.notify.emit({ key: 'excluido', subject: `${ok} item(ns)` });
      if (naoVazias > 0) this.notify.emit({ key: 'pastaNaoVazia', subject: `${naoVazias} pasta(s) não vazia(s)` });
      else if (falhas > 0) this.notify.emit({ key: 'excluidoErro', subject: `${falhas} de ${total} item(ns)` });
    };
    for (const item of itens) {
      const req$ =
        item.tipo === 'pasta'
          ? this.documentsService.excluirPasta(item.id)
          : this.documentsService.excluirDocumento(item.id);
      req$.subscribe({
        next: () => {
          pendentes -= 1;
          feito();
        },
        error: (err: unknown) => {
          pendentes -= 1;
          if ((err as { status?: number })?.status === 409) naoVazias += 1;
          else falhas += 1;
          feito();
        },
      });
    }
  }

  // --- arrastar e soltar ---

  protected onDragStartPasta(event: DragEvent, pasta: Pasta): void {
    this.normalizarSelecaoAoArrastar(chaveDe('pasta', pasta.id));
    this.itemArrastado = { tipo: 'pasta', id: pasta.id, nome: pasta.nome };
    event.dataTransfer?.setData('text/plain', pasta.id);
  }

  protected onDragStartDocumento(event: DragEvent, documento: Documento): void {
    this.normalizarSelecaoAoArrastar(chaveDe('documento', documento.id));
    this.itemArrastado = { tipo: 'documento', id: documento.id, nome: documento.nome };
    event.dataTransfer?.setData('text/plain', documento.id);
  }

  /**
   * Arrastar uma linha que já faz parte de uma seleção múltipla move o grupo inteiro; arrastar
   * qualquer outra move só ela (via `itemArrastado`), sem mexer na seleção — assim um `dragstart`
   * disparado sem querer (ex.: tremida no duplo-clique) não deixa a linha marcada.
   */
  private normalizarSelecaoAoArrastar(chave: ChaveItem): void {
    this.arrastandoSelecao = this.selecao().has(chave) && this.selecao().size > 1;
  }

  protected onDragEnd(): void {
    this.itemArrastado = null;
    this.arrastandoSelecao = false;
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
    if (this.arrastandoSelecao) {
      this.moverSelecionados(pasta.id);
    } else if (this.itemArrastado && !(this.itemArrastado.tipo === 'pasta' && this.itemArrastado.id === pasta.id)) {
      this.mover(this.itemArrastado.tipo, this.itemArrastado.id, pasta.id);
    }
    this.itemArrastado = null;
    this.arrastandoSelecao = false;
  }

  protected onDropNoBreadcrumb(event: DragEvent, item: BreadcrumbItem | null): void {
    event.preventDefault();
    this.dragOverAlvoAtivo.set(false);
    if (this.arrastandoSelecao) {
      this.moverSelecionados(item?.id ?? null);
    } else if (this.itemArrastado) {
      this.mover(this.itemArrastado.tipo, this.itemArrastado.id, item?.id ?? null);
    }
    this.itemArrastado = null;
    this.arrastandoSelecao = false;
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
    if (tipo === TIPO_DOCX || tipo === 'application/msword' || tipo === 'application/vnd.oasis.opendocument.text') {
      return 'fa-solid fa-file-word';
    }
    if (
      tipo === 'application/vnd.ms-excel' ||
      tipo === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ) {
      return 'fa-solid fa-file-excel';
    }
    return 'fa-solid fa-file';
  }

  protected formatarTamanho(bytes: number | null): string {
    return formatFileSize(bytes);
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
