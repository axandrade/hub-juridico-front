import { signal } from '@angular/core';

import { PAINEL_LAYOUT_PADRAO, PainelLayout, ehPainelLayout } from '../models/panel-layout';

export interface PanelShellOptions {
  /** Prefixo das chaves de `localStorage` (ex.: `'hub-juridico.clients'`). */
  storagePrefix: string;
  larguraPadrao?: number;
  larguraMin?: number;
  larguraMax?: number;
  alturaPadrao?: number;
  alturaMin?: number;
  alturaMax?: number;
}

const PADROES: Required<Omit<PanelShellOptions, 'storagePrefix'>> = {
  larguraPadrao: 400,
  larguraMin: 300,
  larguraMax: 680,
  alturaPadrao: 340,
  alturaMin: 220,
  alturaMax: 640,
};

/**
 * Estado + comportamento de um painel lateral posicionável (esquerda/direita/abaixo/diálogo),
 * redimensionável e com posição/tamanho persistidos em `localStorage` — extraído do que era
 * lógica só do `ClientsComponent` pra ser reutilizável (ver `AdvogadoComponent`, a 2ª tela a
 * precisar disso). Não é um serviço Angular (`@Injectable`) de propósito: cada tela instancia o
 * próprio `new PanelShellController(...)` com o `document` injetado e as chaves de storage dela —
 * estado de UI por tela, não um singleton compartilhado.
 *
 * A tela cuida do que é dela: qual componente mostra dentro do painel, o que "clicar fora"
 * significa, etc. Este controller só resolve posição/tamanho/visibilidade.
 */
export class PanelShellController {
  private readonly opts: Required<PanelShellOptions>;
  private redimensionandoFlag = false;

  readonly layoutPainel = signal<PainelLayout>(PAINEL_LAYOUT_PADRAO);
  readonly panelVisible = signal(true);
  readonly painelLargura = signal(0);
  readonly painelAltura = signal(0);

  constructor(
    private readonly document: Document,
    options: PanelShellOptions,
  ) {
    this.opts = { ...PADROES, ...options };
    this.layoutPainel.set(this.carregarLayout());
    this.panelVisible.set(this.layoutPainel() !== 'dialog');
    this.painelLargura.set(
      this.carregarTamanho(this.chave('painelLargura'), this.opts.larguraPadrao, this.opts.larguraMin, this.opts.larguraMax),
    );
    this.painelAltura.set(
      this.carregarTamanho(this.chave('painelAltura'), this.opts.alturaPadrao, this.opts.alturaMin, this.opts.alturaMax),
    );
  }

  /** `true` durante o arraste — quem consome decide o que fazer com isso (ex.: não desmarcar seleção). */
  get redimensionando(): boolean {
    return this.redimensionandoFlag;
  }

  togglePanel(): void {
    this.panelVisible.update((visible) => !visible);
  }

  setPanelVisible(visivel: boolean): void {
    this.panelVisible.set(visivel);
  }

  /** Ao trocar de posição, mostra o painel ali (senão o usuário clica e nada muda). */
  setLayoutPainel(layout: PainelLayout): void {
    this.layoutPainel.set(layout);
    this.panelVisible.set(true);
    this.persistir(this.chave('layout'), layout);
  }

  /** Começa a arrastar a divisória painel/tabela. */
  iniciarResize(event: PointerEvent): void {
    event.preventDefault();
    const layout = this.layoutPainel();
    const vertical = layout === 'bottom';
    const inicioPonteiro = vertical ? event.clientY : event.clientX;
    const tamanhoInicial = vertical ? this.painelAltura() : this.painelLargura();
    // esquerda: arrastar p/ direita alarga; direita/abaixo: arrastar p/ o lado oposto alarga.
    const sinal = layout === 'left' ? 1 : -1;

    const mover = (e: PointerEvent) => {
      this.redimensionandoFlag = true;
      const atual = vertical ? e.clientY : e.clientX;
      const delta = (atual - inicioPonteiro) * sinal;
      if (vertical) {
        this.painelAltura.set(this.limitar(tamanhoInicial + delta, this.opts.alturaMin, this.opts.alturaMax));
      } else {
        this.painelLargura.set(this.limitar(tamanhoInicial + delta, this.opts.larguraMin, this.opts.larguraMax));
      }
    };

    const encerrar = () => {
      this.document.removeEventListener('pointermove', mover);
      this.document.removeEventListener('pointerup', encerrar);
      this.document.body.style.userSelect = '';
      this.document.body.style.cursor = '';
      this.persistir(
        this.chave(vertical ? 'painelAltura' : 'painelLargura'),
        Math.round(vertical ? this.painelAltura() : this.painelLargura()),
      );
      // Limpa a flag depois do clique sintético que fecha o arraste.
      setTimeout(() => (this.redimensionandoFlag = false));
    };

    this.document.addEventListener('pointermove', mover);
    this.document.addEventListener('pointerup', encerrar);
    this.document.body.style.userSelect = 'none';
    this.document.body.style.cursor = vertical ? 'row-resize' : 'col-resize';
  }

  private carregarLayout(): PainelLayout {
    try {
      const salvo = this.document.defaultView?.localStorage.getItem(this.chave('layout'));
      if (ehPainelLayout(salvo)) {
        return salvo;
      }
    } catch {
      /* ignore */
    }
    return PAINEL_LAYOUT_PADRAO;
  }

  private carregarTamanho(chave: string, padrao: number, min: number, max: number): number {
    try {
      const salvo = Number(this.document.defaultView?.localStorage.getItem(chave));
      if (Number.isFinite(salvo) && salvo > 0) {
        return this.limitar(salvo, min, max);
      }
    } catch {
      /* ignore */
    }
    return padrao;
  }

  private persistir(chave: string, valor: string | number): void {
    try {
      this.document.defaultView?.localStorage.setItem(chave, String(valor));
    } catch {
      /* storage indisponível — a escolha vale só nesta sessão */
    }
  }

  private limitar(valor: number, min: number, max: number): number {
    return Math.min(Math.max(valor, min), max);
  }

  private chave(sufixo: string): string {
    return `${this.opts.storagePrefix}.${sufixo}`;
  }
}
