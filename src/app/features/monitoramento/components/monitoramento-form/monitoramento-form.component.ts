import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { map } from 'rxjs';

import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { ToastService } from '../../../../shared/services/toast.service';
import { MonitoramentoResumoRow, MonitoramentoService } from '../../services/monitoramento.service';

/**
 * Criar/editar um monitoramento: nome, descrição e — só ao editar — ativo. Monitoramento não é
 * apagado, só inativado (some da lista padrão, volta com "Incluir inativos").
 */
@Component({
  selector: 'app-monitoramento-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, ButtonComponent],
  templateUrl: './monitoramento-form.component.html',
  styleUrl: '../monitoramento-processo-form/monitoramento-processo-form.component.scss',
})
export class MonitoramentoFormComponent {
  private readonly service = inject(MonitoramentoService);
  private readonly toast = inject(ToastService);

  /** Monitoramento a editar; `null` = novo. */
  readonly monitoramento = input<MonitoramentoResumoRow | null>(null);

  /** Id do monitoramento salvo (o novo, ao criar). */
  readonly salvo = output<number>();
  readonly fechar = output<void>();

  protected readonly nome = signal('');
  protected readonly descricao = signal('');
  protected readonly ativo = signal(true);
  protected readonly salvando = signal(false);

  protected readonly editando = computed(() => this.monitoramento() !== null);
  protected readonly podeSalvar = computed(() => this.nome().trim().length > 0 && !this.salvando());

  constructor() {
    effect(() => {
      const m = this.monitoramento();
      if (m) {
        this.nome.set(m.nome);
        this.descricao.set(m.descricao ?? '');
        this.ativo.set(m.ativo);
      }
    });
  }

  protected onTexto(sinal: 'nome' | 'descricao', event: Event): void {
    this[sinal].set((event.target as HTMLInputElement | HTMLTextAreaElement).value);
  }

  protected salvar(): void {
    if (!this.podeSalvar()) {
      return;
    }
    this.salvando.set(true);
    const corpo = { nome: this.nome().trim(), descricao: this.descricao().trim() || null };
    const m = this.monitoramento();
    const requisicao = m
      ? this.service.editar(m.id, { ...corpo, ativo: this.ativo() }).pipe(map(() => m.id))
      : this.service.criar(corpo);
    requisicao.subscribe({
      next: (id) => {
        this.salvando.set(false);
        this.salvo.emit(id);
        this.fechar.emit();
      },
      error: () => {
        this.salvando.set(false);
        this.toast.erro('Não foi possível salvar o monitoramento.');
      },
    });
  }
}
