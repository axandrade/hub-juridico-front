import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { map } from 'rxjs';

import { DomainService } from '../../../../core/services/domain.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ToastService } from '../../../../shared/services/toast.service';
import { OperacaoChecklistsComponent } from '../operacao-checklists/operacao-checklists.component';
import { OperacaoComentariosComponent } from '../operacao-comentarios/operacao-comentarios.component';
import { OperacaoHistoricoComponent } from '../operacao-historico/operacao-historico.component';
import { OperacaoInformacoesGeraisComponent } from '../operacao-informacoes-gerais/operacao-informacoes-gerais.component';
import { OperacaoDetalheRow, OperacaoWriteApi } from '../../services/operacao-api.model';

const ENTITY = 'operacao';

type OperacaoAba = 'informacoesGerais' | 'checklists' | 'comentarios' | 'historico';

/**
 * Shell do cadastro/edição de operação: selo do processo, abas, rodapé e persistência. Os campos
 * moram nas abas, seguindo o mesmo desenho do painel de Processos.
 */
@Component({
  selector: 'app-operacao-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonComponent,
    OperacaoInformacoesGeraisComponent,
    OperacaoChecklistsComponent,
    OperacaoComentariosComponent,
    OperacaoHistoricoComponent,
  ],
  templateUrl: './operacao-form.component.html',
  styleUrl: './operacao-form.component.scss',
})
export class OperacaoFormComponent {
  private readonly domainService = inject(DomainService);
  private readonly toast = inject(ToastService);

  readonly processoId = input.required<number>();
  /** `null` = cadastro novo; com id, carrega a ficha e `salvar()` vira `PATCH`. */
  readonly operacaoId = input<number | null>(null);
  /** Só pro selo "Processo Nº ..." no topo do formulário — o painel já sabe o CNJ. */
  readonly numeroCnj = input<string | null>(null);

  readonly salvo = output<void>();
  readonly cancelado = output<void>();

  private readonly informacoesGerais = viewChild(OperacaoInformacoesGeraisComponent);

  protected readonly abas: readonly OperacaoAba[] = ['informacoesGerais', 'checklists', 'comentarios', 'historico'];
  protected readonly abaAtiva = signal<OperacaoAba>('informacoesGerais');
  protected readonly entityId = signal<number | null>(null);
  protected readonly salvando = signal(false);

  constructor() {
    effect(() => {
      const form = this.informacoesGerais();
      const id = this.operacaoId();
      if (!form) {
        return;
      }

      untracked(() => {
        this.abaAtiva.set('informacoesGerais');
        if (id === null) {
          this.entityId.set(null);
          form.limpar();
          return;
        }
        this.domainService
          .get<OperacaoDetalheRow>({ entityName: ENTITY, entityId: id })
          .subscribe((op) => {
            this.entityId.set(op.id);
            form.carregar(op);
          });
      });
    });
  }

  protected trocarAba(aba: OperacaoAba): void {
    this.abaAtiva.set(aba);
  }

  protected salvar(): void {
    const informacoes = this.informacoesGerais();
    if (!informacoes) {
      return;
    }

    const validacao = informacoes.validar();
    if (!validacao.ok) {
      this.abaAtiva.set('informacoesGerais');
      this.toast.erro(validacao.mensagem);
      return;
    }

    const dados = informacoes.coletar();
    const payload: OperacaoWriteApi = {
      tipo: dados.tipo,
      processo_id: this.processoId(),
      titulo: dados.titulo,
      prazo_fatal: dados.prazoFatal,
      status: dados.status,
      responsavel_id: dados.responsavelId,
      hora_inicio: dados.horaInicio,
      hora_fim: dados.horaFim,
      importancia: dados.importancia,
      origem: dados.origem,
      link: dados.link,
      teor: dados.teor,
      providencia: dados.providencia,
    };

    const id = this.operacaoId();
    const request$ =
      id === null
        ? this.domainService
            .post<OperacaoWriteApi>({ entityName: ENTITY, body: payload })
            .pipe(map((criado) => criado.id))
        : this.domainService
            .patch<OperacaoWriteApi>({ entityName: ENTITY, entityId: id, body: payload })
            .pipe(map(() => id));

    this.salvando.set(true);
    request$.subscribe({
      next: (salvoId) => {
        this.salvando.set(false);
        this.entityId.set(salvoId);
        this.toast.sucesso(id === null ? 'Operação cadastrada.' : 'Operação atualizada.');
        this.salvo.emit();
      },
      error: (err: unknown) => {
        this.salvando.set(false);
        this.toast.erro(`Não foi possível salvar: ${this.httpErrorMessage(err)}`);
      },
    });
  }

  protected cancelar(): void {
    this.cancelado.emit();
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
