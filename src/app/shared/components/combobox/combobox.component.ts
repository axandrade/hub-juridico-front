import { DOCUMENT } from '@angular/common';
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

import { AutoFocusSelectDirective } from '../../directives/auto-focus-select.directive';

interface ComboOption {
  value: string;
  label: string;
}

/** O que o campo está mostrando: busca (o normal) ou uma das ações de gestão do catálogo. */
type Modo = 'busca' | 'add' | 'edit' | 'delete';

/** Payload do evento `aoEditar`: renomear o item `de` para `para`. */
export interface ComboEdicao {
  de: string;
  para: string;
}

/** Minúsculas, sem acento e sem espaço nas pontas — base da busca "por trechos". */
const normalizar = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();

/**
 * Combobox de texto: um `<input>` com lista suspensa filtrável no lugar do `<select>` nativo.
 * A busca é "por trechos" — a consulta é quebrada por espaços e cada pedaço precisa aparecer
 * em algum ponto do rótulo (sem acento, sem caixa), então "cont soc" acha "Contrato Social".
 * O resultado é ordenado por relevância (prefixo exato → começa com → contém → alfabética).
 * Com `pesquisavel="false"` não há campo de busca: abre/fecha como um `<select>` e a lista
 * mostra todas as opções.
 *
 * Trabalha com opções de texto puro (`options: string[]`). Com `emptyLabel` definido, uma opção
 * extra de valor `''` aparece no topo (equivalente ao `<option value="">` do select).
 *
 * Gestão do catálogo pelo menu "⋮": ligue `adicionar` / `editar` / `excluir` (booleanos) — cada
 * um habilita a opção correspondente no menu. Se **nenhum** estiver ligado, o botão "⋮" nem
 * aparece (fica só a busca). O componente cuida do input inline e da confirmação; ao confirmar,
 * emite `aoAdicionar` (nome) / `aoEditar` ({de, para}) / `aoExcluir` (valor) e volta pra busca —
 * quem persiste (e trata erro) é o pai, que também mantém `options` em dia.
 */
@Component({
  selector: 'app-combobox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AutoFocusSelectDirective],
  templateUrl: './combobox.component.html',
  styleUrl: './combobox.component.scss',
})
export class ComboboxComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  /** Opções selecionáveis (texto puro). */
  readonly options = input<string[]>([]);
  /** Valor atual — uma das `options`, ou `''`. */
  readonly value = input<string>('');
  readonly placeholder = input<string>('');
  /** Quando definido, adiciona no topo uma opção de valor `''` com este rótulo. */
  readonly emptyLabel = input<string>('');
  readonly ariaLabel = input<string>('');
  readonly disabled = input<boolean>(false);
  readonly noResultsText = input<string>('Nenhum resultado');
  /** `false` = sem campo de busca: abre/fecha como um `<select>` e a lista mostra tudo. */
  readonly pesquisavel = input<boolean>(true);
  /** Substantivo do item, pra frase de confirmação e placeholders ("Excluir o {itemNoun} …"). */
  readonly itemNoun = input<string>('item');

  /** Liga a opção "Adicionar" no menu "⋮". */
  readonly adicionar = input<boolean>(false);
  /** Liga a opção "Editar" no menu "⋮" (desabilitada quando nada está selecionado). */
  readonly editar = input<boolean>(false);
  /** Liga a opção "Excluir" no menu "⋮" (desabilitada quando nada está selecionado). */
  readonly excluir = input<boolean>(false);

  readonly valueChange = output<string>();
  /** Confirmou "Adicionar" — o nome digitado. */
  readonly aoAdicionar = output<string>();
  /** Confirmou "Editar" — renomear `de` → `para`. */
  readonly aoEditar = output<ComboEdicao>();
  /** Confirmou "Excluir" — o valor a excluir. */
  readonly aoExcluir = output<string>();

  private readonly campo = viewChild<ElementRef<HTMLInputElement>>('campo');

  protected readonly aberto = signal(false);
  /** Texto digitado enquanto a lista está aberta (fechada, o campo mostra o rótulo do valor). */
  protected readonly consulta = signal('');
  protected readonly destaque = signal(0);

  // --- gestão do catálogo (menu "⋮") ---
  protected readonly modo = signal<Modo>('busca');
  protected readonly menuAberto = signal(false);
  /** Texto do input inline de adicionar/renomear. */
  protected readonly rascunho = signal('');
  /** Valor alvo de editar/excluir — fixado ao entrar no modo, não muda se `value` mudar. */
  protected readonly alvo = signal('');

  /** Só mostra o "⋮" se ao menos uma das 3 ações estiver ligada. */
  protected readonly temAcoes = computed(() => this.adicionar() || this.editar() || this.excluir());

  /** Todas as opções, com a "vazia" no topo quando `emptyLabel` está definido. */
  private readonly todas = computed<ComboOption[]>(() => {
    const base = this.options().map((o) => ({ value: o, label: o }));
    const vazia = this.emptyLabel().trim();
    return vazia ? [{ value: '', label: this.emptyLabel() }, ...base] : base;
  });

  /** Rótulo do valor selecionado — é o que o campo mostra quando fechado. */
  protected readonly rotuloAtual = computed(
    () => this.todas().find((o) => o.value === this.value())?.label ?? '',
  );

  /** Opções que casam com a consulta, já ordenadas por relevância (tudo, se não pesquisável). */
  protected readonly filtradas = computed<ComboOption[]>(() => {
    const todas = this.todas();
    if (!this.pesquisavel()) {
      return todas;
    }
    const consulta = normalizar(this.consulta());
    if (!consulta) {
      return todas;
    }
    const trechos = consulta.split(/\s+/);
    return todas
      .map((opcao) => ({ opcao, alvo: normalizar(opcao.label) }))
      .filter(({ alvo }) => trechos.every((t) => alvo.includes(t)))
      .sort(
        (a, b) =>
          this.relevancia(a.alvo, consulta) - this.relevancia(b.alvo, consulta) ||
          a.alvo.localeCompare(b.alvo, 'pt-BR'),
      )
      .map(({ opcao }) => opcao);
  });

  constructor() {
    // Mantém o destaque dentro da lista quando ela encolhe ao filtrar.
    effect(() => {
      const total = this.filtradas().length;
      untracked(() => {
        if (this.destaque() > total - 1) {
          this.destaque.set(Math.max(0, total - 1));
        }
      });
    });

    // Fecha ao clicar fora. Ouve o `document` na **fase de captura**: modais (`app-modal`) dão
    // `stopPropagation()` no clique dentro do diálogo, então um listener de bolha em `document`
    // nunca receberia o evento. A captura roda antes da bolha e não é barrada por isso.
    const doc = inject(DOCUMENT);
    const aoClicarFora = (event: Event): void => {
      if (this.host.nativeElement.contains(event.target as Node)) {
        return;
      }
      this.fechar();
      this.menuAberto.set(false);
    };
    doc.addEventListener('pointerdown', aoClicarFora, true);
    this.destroyRef.onDestroy(() => doc.removeEventListener('pointerdown', aoClicarFora, true));
  }

  /** Menor = mais relevante: igual (0) → começa com (1) → contém, mais cedo melhor (2+). */
  private relevancia(alvo: string, consulta: string): number {
    if (alvo === consulta) {
      return 0;
    }
    if (alvo.startsWith(consulta)) {
      return 1;
    }
    const pos = alvo.indexOf(consulta);
    return pos === -1 ? 3 : 2 + pos / 1000;
  }

  // --- busca / seleção ---

  protected abrir(): void {
    if (this.disabled() || this.aberto()) {
      return;
    }
    this.menuAberto.set(false);
    this.consulta.set('');
    this.destaque.set(0);
    this.aberto.set(true);
  }

  /** Foco no campo: abre a lista só quando pesquisável (senão o clique é que abre/fecha). */
  protected onFoco(): void {
    if (this.pesquisavel()) {
      this.abrir();
    }
  }

  /** Clique no campo: pesquisável só abre; sem busca, alterna como um `<select>`. */
  protected onClique(): void {
    if (this.pesquisavel() || !this.aberto()) {
      this.abrir();
    } else {
      this.fechar();
    }
  }

  protected onInput(valor: string): void {
    this.consulta.set(valor);
    this.destaque.set(0);
    this.aberto.set(true);
  }

  protected selecionar(opcao: ComboOption): void {
    this.aberto.set(false);
    this.consulta.set('');
    if (opcao.value !== this.value()) {
      this.valueChange.emit(opcao.value);
    }
    this.campo()?.nativeElement.blur();
  }

  protected fechar(): void {
    if (this.aberto()) {
      this.aberto.set(false);
      this.consulta.set('');
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.aberto()) {
          this.abrir();
        } else {
          this.destaque.update((i) => Math.min(i + 1, this.filtradas().length - 1));
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.destaque.update((i) => Math.max(i - 1, 0));
        break;
      case 'Enter': {
        const opcao = this.filtradas()[this.destaque()];
        if (this.aberto() && opcao) {
          event.preventDefault();
          this.selecionar(opcao);
        }
        break;
      }
      case 'Escape':
        if (this.aberto()) {
          event.preventDefault();
          event.stopPropagation(); // não fecha o modal que hospeda o campo
          this.fechar();
        }
        break;
      case 'Tab':
        this.fechar();
        break;
    }
  }

  // --- menu "⋮" e ações de catálogo ---

  protected alternarMenu(): void {
    if (this.disabled()) {
      return;
    }
    this.fechar();
    this.menuAberto.update((v) => !v);
  }

  protected iniciarAdicao(): void {
    this.menuAberto.set(false);
    this.rascunho.set('');
    this.modo.set('add');
  }

  protected iniciarEdicao(): void {
    if (!this.value()) {
      return;
    }
    this.menuAberto.set(false);
    this.alvo.set(this.value());
    this.rascunho.set(this.value());
    this.modo.set('edit');
  }

  protected iniciarExclusao(): void {
    if (!this.value()) {
      return;
    }
    this.menuAberto.set(false);
    this.alvo.set(this.value());
    this.modo.set('delete');
  }

  protected voltarParaBusca(): void {
    this.modo.set('busca');
    this.rascunho.set('');
  }

  /** Confirma "Adicionar" ou "Editar" conforme o `modo` e emite o evento pro pai. */
  protected salvar(): void {
    const nome = this.rascunho().trim();
    if (!nome) {
      return;
    }
    if (this.modo() === 'edit') {
      if (nome !== this.alvo()) {
        this.aoEditar.emit({ de: this.alvo(), para: nome });
      }
    } else {
      this.aoAdicionar.emit(nome);
    }
    this.voltarParaBusca();
  }

  protected confirmarExclusao(): void {
    this.aoExcluir.emit(this.alvo());
    this.voltarParaBusca();
  }
}
