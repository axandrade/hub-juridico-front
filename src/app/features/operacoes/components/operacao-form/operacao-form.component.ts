import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';

import { DomainService } from '../../../../core/services/domain.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ComboboxComponent } from '../../../../shared/components/combobox/combobox.component';
import { DomainModelDropdownComponent } from '../../../../shared/components/domain-dropdown/domain-model-dropdown.component';
import { ToastService } from '../../../../shared/services/toast.service';
import { mensagensCamposInvalidos } from '../../../../shared/utils/form-validacao';
import { OperacaoWriteApi, TIPO_OPERACAO_LABEL, TipoOperacao } from '../../services/operacao-api.model';

const ENTITY = 'operacao';

const TIPOS: TipoOperacao[] = ['INTIMACAO', 'TAREFA', 'COMPROMISSO'];
const IMPORTANCIA_OPCOES = ['Baixa', 'Média', 'Alta', 'Urgente'];

const ROTULOS_CAMPOS: Record<string, string> = {
  titulo: 'Título',
};

type OperacaoForm = FormGroup<{
  titulo: FormControl<string>;
  prazoFatal: FormControl<string>;
  status: FormControl<string>;
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
 * Formulário de cadastro de operação — vive dentro do `app-modal` do
 * `app-operacoes-processo-panel` (mesmo padrão de `app-usuario-form`). Sem service dedicado: como
 * `Advogado`, `Operacao` é `POST`ada direto em `/domain/operacao` via `DomainService` (ver
 * `Operacao.criarOperacao` no backend).
 *
 * Um dropdown de "Tipo" (Intimação/Tarefa/Compromisso) troca quais campos aparecem — mesma
 * tabela pros 3 tipos no backend, campos que não se aplicam vão `null`. `processoId` não é um
 * campo do formulário: vem fixo do painel que já está filtrado por aquele processo.
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

  readonly salvo = output<void>();
  readonly cancelado = output<void>();

  protected readonly tipos = TIPOS;
  protected readonly tipoOpcoes = TIPOS.map((t) => TIPO_OPERACAO_LABEL[t]);
  protected readonly importanciaOpcoes = IMPORTANCIA_OPCOES;

  protected readonly tipo = signal<TipoOperacao>('INTIMACAO');
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
    status: text(),
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
    this.form.patchValue({ status: 'Pendente', origem: 'Cadastro manual' });
  }

  protected tipoRotulo(): string {
    return TIPO_OPERACAO_LABEL[this.tipo()];
  }

  protected onTipoChange(rotulo: string): void {
    const achado = this.tipos.find((t) => TIPO_OPERACAO_LABEL[t] === rotulo);
    if (achado) {
      this.tipo.set(achado);
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
      status: raw.status.trim() || 'Pendente',
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

    this.salvando.set(true);
    this.domainService.post<OperacaoWriteApi>({ entityName: ENTITY, body: payload }).subscribe({
      next: () => {
        this.salvando.set(false);
        this.toast.sucesso('Operação cadastrada.');
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
