import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { forkJoin } from 'rxjs';

import { DomainService, IDomainPage } from '../../../../core/services/domain.service';
import { ToastService } from '../../../../shared/services/toast.service';

const ITEM_ENTITY = 'operacao-checklist-item';
/** Quanto tempo a barrinha "Item excluído · Desfazer" fica visível. */
const DESFAZER_MS = 6000;
/** Duração da comemoração ao concluir o último item. */
const COMEMORACAO_MS = 2500;

interface OperacaoChecklistItemRow {
  id: number;
  operacaoId: number;
  descricao: string | null;
  concluido: boolean | null;
  ordem: number | null;
}

interface ChecklistItemView extends OperacaoChecklistItemRow {
  /**
   * Chave estável do `@for`. Não dá pra usar o `id`: item recém-criado entra na tela ANTES do
   * servidor responder (id provisório) e trocar a chave recriaria o DOM — a animação de entrada
   * tocaria duas vezes.
   */
  chave: string;
  /** Criado na tela, aguardando o POST — ainda sem id real, então sem marcar/editar/excluir. */
  pendente: boolean;
}

/**
 * Aba "Checklists": itens da operação com marcar, editar inline, reordenar (arrastar ou Alt+↑/↓),
 * excluir com "Desfazer" e ocultar concluídos.
 *
 * Toda ação é **otimista**: a tela muda na hora e a requisição roda por trás; se falhar, volta ao
 * estado anterior e avisa. A lista só é buscada inteira ao abrir a operação — recarregar a cada
 * clique fazia a lista sumir/piscar o spinner e matava as animações.
 */
@Component({
  selector: 'app-operacao-checklists',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkDropList, CdkDrag, CdkDragHandle],
  templateUrl: './operacao-checklists.component.html',
  styleUrl: './operacao-checklists.component.scss',
})
export class OperacaoChecklistsComponent {
  private readonly domainService = inject(DomainService);
  private readonly toast = inject(ToastService);
  private proximaChave = 1;
  private timerDesfazer: ReturnType<typeof setTimeout> | undefined;
  private timerComemoracao: ReturnType<typeof setTimeout> | undefined;

  readonly operacaoId = input<number | null>(null);

  protected readonly carregando = signal(false);
  protected readonly itens = signal<ChecklistItemView[]>([]);
  protected readonly erro = signal('');
  protected readonly ocultarConcluidos = signal(false);
  protected readonly editandoChave = signal<string | null>(null);
  protected readonly comemorando = signal(false);
  /** Último item excluído, enquanto ainda dá pra desfazer (e onde ele estava na lista). */
  protected readonly excluido = signal<{ item: ChecklistItemView; indice: number } | null>(null);

  private readonly campoEdicao = viewChild<ElementRef<HTMLInputElement>>('campoEdicao');

  protected readonly podeEditar = computed(() => this.operacaoId() !== null);

  /** Público: o formulário da operação mostra "3/7" no título da aba. */
  readonly resumo = computed(() => {
    const itens = this.itens();
    return { concluidos: itens.filter((item) => !!item.concluido).length, total: itens.length };
  });

  protected readonly progresso = computed(() => {
    const { concluidos, total } = this.resumo();
    return total ? Math.round((concluidos / total) * 100) : 0;
  });

  protected readonly itensVisiveis = computed(() =>
    this.ocultarConcluidos() ? this.itens().filter((item) => !item.concluido) : this.itens(),
  );

  constructor() {
    effect(() => {
      const operacaoId = this.operacaoId();
      untracked(() => {
        this.editandoChave.set(null);
        this.excluido.set(null);
        if (operacaoId === null) {
          this.itens.set([]);
          this.erro.set('');
          return;
        }
        this.carregar(operacaoId);
      });
    });

    // Campo de edição inline acabou de aparecer: foca e seleciona o texto pra já sair digitando.
    effect(() => {
      const campo = this.campoEdicao()?.nativeElement;
      if (campo) {
        campo.focus();
        campo.select();
      }
    });

    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.timerDesfazer);
      clearTimeout(this.timerComemoracao);
    });
  }

  protected recarregar(): void {
    const operacaoId = this.operacaoId();
    if (operacaoId !== null) {
      this.carregar(operacaoId);
    }
  }

  // --- adicionar ---

  protected adicionarDoCampo(campo: HTMLInputElement): void {
    const descricao = campo.value.trim();
    if (!descricao) {
      return;
    }
    // Limpa na hora e mantém o foco: dá pra digitar item, Enter, item, Enter... sem clicar de novo.
    campo.value = '';
    this.criarItens([descricao]);
  }

  /** Colar várias linhas (ex.: lista copiada de um e-mail) cria um item por linha. */
  protected colarNoCampo(evento: ClipboardEvent, campo: HTMLInputElement): void {
    const texto = evento.clipboardData?.getData('text') ?? '';
    const linhas = texto
      .split(/\r?\n/)
      .map((linha) => linha.replace(/^\s*(?:[-*•]|\d+[.)]|\[[ xX]?\])\s*/, '').trim())
      .filter(Boolean);
    if (linhas.length < 2) {
      return; // uma linha só: deixa o navegador colar normalmente no campo
    }
    evento.preventDefault();
    const digitado = campo.value.trim();
    campo.value = '';
    this.criarItens(digitado ? [digitado, ...linhas] : linhas);
  }

  private criarItens(descricoes: string[]): void {
    const operacaoId = this.operacaoId();
    if (operacaoId === null) {
      return;
    }
    let ordem = this.proximaOrdem();
    const novos: ChecklistItemView[] = descricoes.map((descricao) => ({
      id: 0,
      operacaoId,
      descricao: descricao.slice(0, 255),
      concluido: false,
      ordem: ordem++,
      chave: this.novaChave(),
      pendente: true,
    }));
    this.itens.update((lista) => [...lista, ...novos]);

    for (const novo of novos) {
      this.domainService
        .post({
          entityName: ITEM_ENTITY,
          body: { operacao_id: operacaoId, descricao: novo.descricao, concluido: false, ordem: novo.ordem, ativo: true },
        })
        .subscribe({
          next: (criado) => this.atualizarItem(novo.chave, { id: criado.id, pendente: false }),
          error: (err: unknown) => {
            this.itens.update((lista) => lista.filter((item) => item.chave !== novo.chave));
            this.toast.erro(`Não foi possível adicionar "${novo.descricao}": ${this.httpErrorMessage(err)}`);
          },
        });
    }
  }

  // --- marcar ---

  protected alternarItem(item: ChecklistItemView): void {
    if (item.pendente) {
      return;
    }
    const concluido = !item.concluido;
    this.atualizarItem(item.chave, { concluido });
    const { concluidos, total } = this.resumo();
    if (concluido && total > 0 && concluidos === total) {
      this.comemorar();
    }

    this.domainService.patch({ entityName: ITEM_ENTITY, entityId: item.id, body: { concluido } }).subscribe({
      error: (err: unknown) => {
        this.atualizarItem(item.chave, { concluido: !concluido });
        this.toast.erro(`Não foi possível atualizar o item: ${this.httpErrorMessage(err)}`);
      },
    });
  }

  private comemorar(): void {
    this.comemorando.set(true);
    clearTimeout(this.timerComemoracao);
    this.timerComemoracao = setTimeout(() => this.comemorando.set(false), COMEMORACAO_MS);
  }

  // --- editar ---

  protected iniciarEdicao(item: ChecklistItemView): void {
    if (!item.pendente) {
      this.editandoChave.set(item.chave);
    }
  }

  protected cancelarEdicao(): void {
    this.editandoChave.set(null);
  }

  /** Enter ou sair do campo salva; vazio ou igual ao atual só fecha (apagar é pela lixeira). */
  protected salvarEdicao(item: ChecklistItemView, campo: HTMLInputElement): void {
    if (this.editandoChave() !== item.chave) {
      return; // o blur que vem depois do Enter/Esc — já tratado
    }
    this.editandoChave.set(null);
    const descricao = campo.value.trim();
    const anterior = item.descricao;
    if (!descricao || descricao === anterior) {
      return;
    }
    this.atualizarItem(item.chave, { descricao });
    this.domainService.patch({ entityName: ITEM_ENTITY, entityId: item.id, body: { descricao } }).subscribe({
      error: (err: unknown) => {
        this.atualizarItem(item.chave, { descricao: anterior });
        this.toast.erro(`Não foi possível renomear o item: ${this.httpErrorMessage(err)}`);
      },
    });
  }

  // --- excluir / desfazer ---

  protected excluirItem(item: ChecklistItemView): void {
    if (item.pendente) {
      return;
    }
    const indice = this.itens().findIndex((i) => i.chave === item.chave);
    this.itens.update((lista) => lista.filter((i) => i.chave !== item.chave));
    this.excluido.set({ item, indice });
    clearTimeout(this.timerDesfazer);
    this.timerDesfazer = setTimeout(() => this.excluido.set(null), DESFAZER_MS);

    this.domainService.patch({ entityName: ITEM_ENTITY, entityId: item.id, body: { ativo: false } }).subscribe({
      error: (err: unknown) => {
        this.reinserir(item, indice);
        if (this.excluido()?.item.chave === item.chave) {
          this.excluido.set(null);
        }
        this.toast.erro(`Não foi possível excluir o item: ${this.httpErrorMessage(err)}`);
      },
    });
  }

  /** Exclusão é lógica (`ativo = false`): desfazer é só reativar — a `ordem` continua a mesma. */
  protected desfazerExclusao(): void {
    const alvo = this.excluido();
    if (!alvo) {
      return;
    }
    clearTimeout(this.timerDesfazer);
    this.excluido.set(null);
    this.reinserir(alvo.item, alvo.indice);
    this.domainService.patch({ entityName: ITEM_ENTITY, entityId: alvo.item.id, body: { ativo: true } }).subscribe({
      error: (err: unknown) => {
        this.itens.update((lista) => lista.filter((i) => i.chave !== alvo.item.chave));
        this.toast.erro(`Não foi possível restaurar o item: ${this.httpErrorMessage(err)}`);
      },
    });
  }

  private reinserir(item: ChecklistItemView, indice: number): void {
    this.itens.update((lista) => {
      const copia = [...lista];
      copia.splice(Math.min(indice, copia.length), 0, item);
      return copia;
    });
  }

  // --- reordenar ---

  protected reordenarItens(event: CdkDragDrop<ChecklistItemView[]>): void {
    this.mover(event.previousIndex, event.currentIndex);
  }

  /** Alt+↑ / Alt+↓ na alça — o arrastar do CDK não tem teclado. */
  protected moverPeloTeclado(evento: Event, indiceVisivel: number, delta: -1 | 1, alca: HTMLElement): void {
    evento.preventDefault();
    const destino = indiceVisivel + delta;
    if (destino < 0 || destino >= this.itensVisiveis().length) {
      return;
    }
    this.mover(indiceVisivel, destino);
    // O `@for` move o mesmo nó (chave estável), então a alça continua focada; só garante.
    queueMicrotask(() => alca.focus());
  }

  /**
   * Índices são da lista VISÍVEL (pode estar com concluídos ocultos): traduz pra lista completa
   * pelo item de destino, renumera e só manda PATCH pra quem de fato mudou de `ordem`.
   */
  private mover(deVisivel: number, paraVisivel: number): void {
    if (deVisivel === paraVisivel) {
      return;
    }
    const visiveis = this.itensVisiveis();
    const anteriores = this.itens();
    const todos = [...anteriores];
    const de = todos.indexOf(visiveis[deVisivel]);
    const para = todos.indexOf(visiveis[paraVisivel]);
    moveItemInArray(todos, de, para);
    const renumerados = todos.map((item, index) => ({ ...item, ordem: index + 1 }));
    this.itens.set(renumerados);

    const mudaram = renumerados.filter(
      (item) => !item.pendente && anteriores.find((a) => a.chave === item.chave)?.ordem !== item.ordem,
    );
    if (!mudaram.length) {
      return;
    }
    forkJoin(
      mudaram.map((item) =>
        this.domainService.patch({ entityName: ITEM_ENTITY, entityId: item.id, body: { ordem: item.ordem } }),
      ),
    ).subscribe({
      error: (err: unknown) => {
        this.itens.set(anteriores);
        this.toast.erro(`Não foi possível salvar a nova ordem: ${this.httpErrorMessage(err)}`);
      },
    });
  }

  // --- carga / utilitários ---

  private carregar(operacaoId: number): void {
    this.carregando.set(true);
    this.erro.set('');
    this.domainService
      .get<IDomainPage<OperacaoChecklistItemRow>>({
        entityName: ITEM_ENTITY,
        fields: 'id,operacaoId,descricao,concluido,ordem',
        filter: `operacaoId eq ${operacaoId} and ativo eq true`,
        sort: 'ordem,id',
        size: 500,
      })
      .subscribe({
        next: (pagina) => {
          this.itens.set(pagina.content.map((item) => ({ ...item, chave: this.novaChave(), pendente: false })));
          this.carregando.set(false);
        },
        error: (err: unknown) => {
          this.carregando.set(false);
          this.erro.set(this.httpErrorMessage(err));
        },
      });
  }

  private atualizarItem(chave: string, mudancas: Partial<ChecklistItemView>): void {
    this.itens.update((lista) => lista.map((item) => (item.chave === chave ? { ...item, ...mudancas } : item)));
  }

  private novaChave(): string {
    return `item-${this.proximaChave++}`;
  }

  private proximaOrdem(): number {
    return Math.max(0, ...this.itens().map((item) => item.ordem ?? 0)) + 1;
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
