import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { forkJoin, of } from 'rxjs';

import { DomainService, IDomainPage } from '../../../../core/services/domain.service';
import { ToastService } from '../../../../shared/services/toast.service';

const ITEM_ENTITY = 'operacao-checklist-item';

interface OperacaoChecklistItemRow {
  id: number;
  operacaoId: number;
  descricao: string | null;
  concluido: boolean | null;
  ordem: number | null;
}

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

  readonly operacaoId = input<number | null>(null);

  protected readonly carregando = signal(false);
  protected readonly salvando = signal(false);
  protected readonly itens = signal<OperacaoChecklistItemRow[]>([]);
  protected readonly erro = signal('');
  protected readonly podeEditar = computed(() => this.operacaoId() !== null);
  protected readonly progresso = computed(() => {
    const itens = this.itens();
    if (!itens.length) {
      return 0;
    }
    const concluidos = itens.filter((item) => !!item.concluido).length;
    return Math.round((concluidos / itens.length) * 100);
  });

  constructor() {
    effect(() => {
      const operacaoId = this.operacaoId();
      untracked(() => {
        if (operacaoId === null) {
          this.itens.set([]);
          this.erro.set('');
          return;
        }
        this.carregar(operacaoId);
      });
    });
  }

  protected adicionarItem(input: HTMLInputElement): void {
    const descricao = input.value.trim();
    const operacaoId = this.operacaoId();
    if (!descricao || operacaoId === null) {
      return;
    }
    this.salvando.set(true);
    this.domainService
      .post({
        entityName: ITEM_ENTITY,
        body: {
          operacao_id: operacaoId,
          descricao,
          concluido: false,
          ordem: this.proximaOrdem(this.itens()),
          ativo: true,
        },
      })
      .subscribe({
        next: () => {
          input.value = '';
          this.salvando.set(false);
          this.carregar(operacaoId);
        },
        error: (err: unknown) => {
          this.salvando.set(false);
          this.toast.erro(`Não foi possível adicionar o item: ${this.httpErrorMessage(err)}`);
        },
      });
  }

  protected alternarItem(item: OperacaoChecklistItemRow): void {
    const operacaoId = this.operacaoId();
    this.domainService
      .patch({
        entityName: ITEM_ENTITY,
        entityId: item.id,
        body: { concluido: !item.concluido },
      })
      .subscribe({
        next: () => {
          if (operacaoId !== null) {
            this.carregar(operacaoId);
          }
        },
        error: (err: unknown) => this.toast.erro(`Não foi possível atualizar o item: ${this.httpErrorMessage(err)}`),
      });
  }

  protected excluirItem(item: OperacaoChecklistItemRow): void {
    const operacaoId = this.operacaoId();
    this.domainService.patch({ entityName: ITEM_ENTITY, entityId: item.id, body: { ativo: false } }).subscribe({
      next: () => {
        if (operacaoId !== null) {
          this.carregar(operacaoId);
        }
      },
      error: (err: unknown) => this.toast.erro(`Não foi possível excluir o item: ${this.httpErrorMessage(err)}`),
    });
  }

  protected reordenarItens(event: CdkDragDrop<OperacaoChecklistItemRow[]>): void {
    if (event.previousIndex === event.currentIndex) {
      return;
    }

    const reordenados = [...this.itens()];
    moveItemInArray(reordenados, event.previousIndex, event.currentIndex);
    const comNovaOrdem = reordenados.map((item, index) => ({ ...item, ordem: index + 1 }));
    this.itens.set(comNovaOrdem);
    this.persistirOrdem(comNovaOrdem);
  }

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
          this.itens.set(pagina.content);
          this.carregando.set(false);
        },
        error: (err: unknown) => {
          this.carregando.set(false);
          this.erro.set(this.httpErrorMessage(err));
        },
      });
  }

  private proximaOrdem(itens: { ordem: number | null }[]): number {
    return Math.max(0, ...itens.map((item) => item.ordem ?? 0)) + 1;
  }

  private persistirOrdem(itens: OperacaoChecklistItemRow[]): void {
    const operacaoId = this.operacaoId();
    const requests = itens.map((item, index) =>
      this.domainService.patch({
        entityName: ITEM_ENTITY,
        entityId: item.id,
        body: { ordem: index + 1 },
      }),
    );

    (requests.length ? forkJoin(requests) : of([])).subscribe({
      next: () => {
        if (operacaoId !== null) {
          this.carregar(operacaoId);
        }
      },
      error: (err: unknown) => {
        this.toast.erro(`Não foi possível salvar a nova ordem: ${this.httpErrorMessage(err)}`);
        if (operacaoId !== null) {
          this.carregar(operacaoId);
        }
      },
    });
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
