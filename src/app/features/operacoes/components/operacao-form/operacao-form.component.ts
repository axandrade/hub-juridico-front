import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { map } from 'rxjs';

import { DomainService } from '../../../../core/services/domain.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ComboboxComponent } from '../../../../shared/components/combobox/combobox.component';
import { DomainModelDropdownComponent } from '../../../../shared/components/domain-dropdown/domain-model-dropdown.component';
import { ToastService } from '../../../../shared/services/toast.service';
import { mensagensCamposInvalidos } from '../../../../shared/utils/form-validacao';
import {
  OperacaoDetalheRow,
  OperacaoWriteApi,
  STATUS_OPERACAO_LABEL,
  StatusOperacao,
  TIPO_OPERACAO_LABEL,
  TipoOperacao,
} from '../../services/operacao-api.model';

const ENTITY = 'operacao';

const TIPOS: TipoOperacao[] = ['INTIMACAO', 'TAREFA', 'COMPROMISSO'];
const IMPORTANCIA_OPCOES = ['Baixa', 'Média', 'Alta', 'Urgente'];
const STATUS: StatusOperacao[] = ['CUMPRIDO', 'NAO_CUMPRIDO', 'PENDENTE', 'ATRASADO'];

const ROTULOS_CAMPOS: Record<string, string> = {
  titulo: 'Título',
};

type OperacaoForm = FormGroup<{
  titulo: FormControl<string>;
  prazoFatal: FormControl<string>;
  horaInicio: FormControl<string>;
  horaFim: FormControl<string>;
  importancia: FormControl<string>;
  dataEvento: FormControl<string>;
  horaEvento: FormControl<string>;
  horaPrazo: FormControl<string>;
  origem: FormControl<string>;
  link: FormControl<string>;
  teor: FormControl<string>;
  providencia: FormControl<string>;
}>;

function text(validators: ValidatorFn[] = []): FormControl<string> {
  return new FormControl('', { nonNullable: true, validators });
}

/**
 * Formulário de cadastro/edição de operação — vive dentro do `app-modal` do
 * `app-operacoes-processo-panel` (mesmo padrão de `app-usuario-form`). Sem service dedicado: como
 * `Advogado`, `Operacao` é `POST`ada (criar) ou `PATCH`ada (editar) direto em `/domain/operacao`
 * via `DomainService` (ver `Operacao.criarOperacao` no backend — o `PATCH` não precisa de método
 * dedicado, é o merge genérico do ddd-noap).
 *
 * Um dropdown de "Tipo" (Intimação/Tarefa/Compromisso) troca quais campos aparecem — mesma
 * tabela pros 3 tipos no backend, campos que não se aplicam vão `null`. "Status" é outro dropdown
 * fixo (Cumprido/Não cumprido/Pendente/Atrasado — `StatusOperacao` no backend, mesmo mecanismo de
 * enum + `@Enumerated(EnumType.STRING)` de `TipoOperacao`), os dois fora do `FormGroup` reativo
 * (signals `tipo`/`status`, não `FormControl`) pelo mesmo motivo: o valor exibido no combobox é o
 * rótulo em pt-BR, não a constante do enum. Diferente de "Tipo", "Status" fica editável desde o
 * cadastro (nasce "Pendente", mas o usuário pode mudar já na criação). `processoId` não é um
 * campo do formulário: vem fixo do painel que já está filtrado por aquele processo (mesmo em
 * edição — não dá pra mover a operação pra outro processo por aqui).
 */
@Component({
  selector: 'app-operacao-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ButtonComponent, ComboboxComponent, DomainModelDropdownComponent],
  templateUrl: './operacao-form.component.html',
  styleUrl: './operacao-form.component.scss',
})
export class OperacaoFormComponent {
  private readonly domainService = inject(DomainService);
  private readonly toast = inject(ToastService);

  readonly processoId = input.required<number>();
  /** `null` = cadastro novo; com id, carrega a ficha e `salvar()` vira `PATCH`. */
  readonly operacaoId = input<number | null>(null);

  readonly salvo = output<void>();
  readonly cancelado = output<void>();

  protected readonly tipos = TIPOS;
  protected readonly tipoOpcoes = TIPOS.map((t) => TIPO_OPERACAO_LABEL[t]);
  protected readonly importanciaOpcoes = IMPORTANCIA_OPCOES;
  protected readonly statusOpcoes = STATUS.map((s) => STATUS_OPERACAO_LABEL[s]);
  /** Tipo é imutável após criado (os campos que ele controla mudam demais pra editar sem confusão). */
  protected readonly tipoTravado = computed(() => this.operacaoId() !== null);

  protected readonly tipo = signal<TipoOperacao>('INTIMACAO');
  protected readonly status = signal<StatusOperacao>('PENDENTE');
  protected readonly ehTarefa = computed(() => this.tipo() === 'TAREFA');
  protected readonly ehIntimacao = computed(() => this.tipo() === 'INTIMACAO');
  protected readonly ehTarefaOuCompromisso = computed(() => this.tipo() !== 'INTIMACAO');

  protected readonly responsavelId = signal<number | null>(null);
  protected readonly responsavelLabel = signal('');
  protected readonly responsavelValor = computed(() =>
    this.responsavelId() === null ? '' : String(this.responsavelId()),
  );

  protected readonly rotuloUsuario = (item: Record<string, unknown>): string =>
    String(item['name'] ?? '(sem nome)');

  protected readonly salvando = signal(false);

  protected readonly form: OperacaoForm = new FormGroup({
    titulo: text([Validators.required]),
    prazoFatal: text(),
    horaInicio: text(),
    horaFim: text(),
    importancia: text(),
    dataEvento: text(),
    horaEvento: text(),
    horaPrazo: text(),
    origem: text(),
    link: text(),
    teor: text(),
    providencia: text(),
  });

  constructor() {
    effect(() => {
      const id = this.operacaoId();
      untracked(() => {
        if (id === null) {
          this.resetToEmpty();
          return;
        }
        this.domainService
          .get<OperacaoDetalheRow>({ entityName: ENTITY, entityId: id })
          .subscribe((op) => this.loadIntoForm(op));
      });
    });
  }

  private resetToEmpty(): void {
    this.form.reset();
    this.form.patchValue({ origem: 'Cadastro manual' });
    this.tipo.set('INTIMACAO');
    this.status.set('PENDENTE');
    this.responsavelId.set(null);
    this.responsavelLabel.set('');
  }

  private loadIntoForm(op: OperacaoDetalheRow): void {
    this.tipo.set(op.tipo);
    this.status.set(op.status ?? 'PENDENTE');
    this.responsavelId.set(op.responsavelId);
    this.responsavelLabel.set('');
    if (op.responsavelId !== null) {
      this.domainService
        .get<{ name: string }>({ entityName: 'user', entityId: op.responsavelId, fields: 'name' })
        .subscribe((u) => this.responsavelLabel.set(u?.name ?? ''));
    }
    this.form.reset();
    this.form.patchValue({
      titulo: op.titulo ?? '',
      prazoFatal: op.prazoFatal ?? '',
      horaInicio: op.horaInicio ?? '',
      horaFim: op.horaFim ?? '',
      importancia: op.importancia ?? '',
      dataEvento: op.dataEvento ?? '',
      horaEvento: op.horaEvento ?? '',
      horaPrazo: op.horaPrazo ?? '',
      origem: op.origem ?? '',
      link: op.link ?? '',
      teor: op.teor ?? '',
      providencia: op.providencia ?? '',
    });
  }

  protected tipoRotulo(): string {
    return TIPO_OPERACAO_LABEL[this.tipo()];
  }

  protected onTipoChange(rotulo: string): void {
    if (this.tipoTravado()) {
      return;
    }
    const achado = this.tipos.find((t) => TIPO_OPERACAO_LABEL[t] === rotulo);
    if (achado) {
      this.tipo.set(achado);
    }
  }

  protected statusRotulo(): string {
    return STATUS_OPERACAO_LABEL[this.status()];
  }

  protected onStatusChange(rotulo: string): void {
    const achado = STATUS.find((s) => STATUS_OPERACAO_LABEL[s] === rotulo);
    if (achado) {
      this.status.set(achado);
    }
  }

  protected onResponsavelChange(valor: string): void {
    this.responsavelId.set(valor ? Number(valor) : null);
    this.responsavelLabel.set('');
  }

  protected salvar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      const mensagens = mensagensCamposInvalidos(this.form, ROTULOS_CAMPOS);
      this.toast.erro(`Preencha corretamente: ${mensagens.join('; ')}`);
      return;
    }

    const raw = this.form.getRawValue();
    const tipo = this.tipo();
    const tarefaOuCompromisso = this.ehTarefaOuCompromisso();
    const intimacao = this.ehIntimacao();

    const payload: OperacaoWriteApi = {
      tipo,
      processo_id: this.processoId(),
      titulo: raw.titulo.trim(),
      prazo_fatal: raw.prazoFatal || null,
      status: this.status(),
      responsavel_id: this.responsavelId(),
      hora_inicio: tarefaOuCompromisso ? raw.horaInicio || null : null,
      hora_fim: tarefaOuCompromisso ? raw.horaFim || null : null,
      importancia: this.ehTarefa() ? raw.importancia || null : null,
      data_evento: intimacao ? raw.dataEvento || null : null,
      hora_evento: intimacao ? raw.horaEvento || null : null,
      hora_prazo: intimacao ? raw.horaPrazo || null : null,
      origem: intimacao ? raw.origem.trim() || null : null,
      link: intimacao ? raw.link.trim() || null : null,
      teor: intimacao ? raw.teor.trim() || null : null,
      providencia: intimacao ? raw.providencia.trim() || null : null,
    };

    const id = this.operacaoId();
    const request$ =
      id === null
        ? this.domainService
            .post<OperacaoWriteApi>({ entityName: ENTITY, body: payload })
            .pipe(map(() => undefined))
        : this.domainService.patch<OperacaoWriteApi>({ entityName: ENTITY, entityId: id, body: payload });

    this.salvando.set(true);
    request$.subscribe({
      next: () => {
        this.salvando.set(false);
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
