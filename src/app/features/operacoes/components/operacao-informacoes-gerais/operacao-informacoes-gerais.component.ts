import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';

import { DomainService } from '../../../../core/services/domain.service';
import { ComboboxComponent } from '../../../../shared/components/combobox/combobox.component';
import { DomainModelDropdownComponent } from '../../../../shared/components/domain-dropdown/domain-model-dropdown.component';
import { mensagensCamposInvalidos } from '../../../../shared/utils/form-validacao';
import {
  ORIGEM_OPERACAO_LABEL,
  OrigemOperacao,
  OperacaoDetalheRow,
  STATUS_OPERACAO_LABEL,
  StatusOperacao,
  TIPO_OPERACAO_LABEL,
  TipoOperacao,
} from '../../services/operacao-api.model';

const TIPOS: TipoOperacao[] = ['INTIMACAO', 'TAREFA', 'COMPROMISSO'];
const IMPORTANCIA_OPCOES = ['Baixa', 'Média', 'Alta', 'Urgente'];
const STATUS: StatusOperacao[] = ['CUMPRIDO', 'NAO_CUMPRIDO', 'PENDENTE', 'ATRASADO'];
const ORIGENS: OrigemOperacao[] = [
  'CADASTRO_MANUAL',
  'ANDAMENTO_AUTOMATICO',
  'DIARIO',
  'EMAIL',
  'TELEFONE_WHATSAPP',
  'SISTEMA_EXTERNO',
];

const ROTULOS_CAMPOS: Record<string, string> = {
  titulo: 'Título',
};

type OperacaoCamposForm = FormGroup<{
  titulo: FormControl<string>;
  prazoFatal: FormControl<string>;
  horaInicio: FormControl<string>;
  horaFim: FormControl<string>;
  importancia: FormControl<string>;
  link: FormControl<string>;
  teor: FormControl<string>;
  providencia: FormControl<string>;
}>;

export type OperacaoInformacoesGeraisValidacao =
  | { ok: true }
  | { ok: false; mensagem: string };

export interface OperacaoInformacoesGeraisValores {
  tipo: TipoOperacao;
  titulo: string;
  prazoFatal: string | null;
  status: StatusOperacao;
  responsavelId: number | null;
  horaInicio: string | null;
  horaFim: string | null;
  importancia: string | null;
  origem: OrigemOperacao | null;
  link: string | null;
  teor: string | null;
  providencia: string | null;
}

function text(validators: ValidatorFn[] = []): FormControl<string> {
  return new FormControl('', { nonNullable: true, validators });
}

/** ISO com timezone (`Operacao.prazoFatal`, `Instant`) -> valor de `<input type="datetime-local">`. */
function instantParaDatetimeLocal(iso: string | null): string {
  if (!iso) {
    return '';
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Valor de `<input type="datetime-local">` -> ISO com timezone pro payload. */
function datetimeLocalParaInstant(valor: string): string | null {
  if (!valor) {
    return null;
  }
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

@Component({
  selector: 'app-operacao-informacoes-gerais',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ComboboxComponent, DomainModelDropdownComponent],
  templateUrl: './operacao-informacoes-gerais.component.html',
  styleUrl: './operacao-informacoes-gerais.component.scss',
})
export class OperacaoInformacoesGeraisComponent {
  private readonly domainService = inject(DomainService);

  protected readonly tipos = TIPOS;
  protected readonly tipoOpcoes = TIPOS.map((t) => TIPO_OPERACAO_LABEL[t]);
  protected readonly importanciaOpcoes = IMPORTANCIA_OPCOES;
  protected readonly statusOpcoes = STATUS.map((s) => STATUS_OPERACAO_LABEL[s]);
  protected readonly origemOpcoes = ORIGENS.map((o) => ORIGEM_OPERACAO_LABEL[o]);
  protected readonly tipoTravado = signal(false);

  protected readonly tipo = signal<TipoOperacao>('INTIMACAO');
  protected readonly status = signal<StatusOperacao>('PENDENTE');
  protected readonly origem = signal<OrigemOperacao>('CADASTRO_MANUAL');
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

  protected readonly form: OperacaoCamposForm = new FormGroup({
    titulo: text([Validators.required]),
    prazoFatal: text(),
    horaInicio: text(),
    horaFim: text(),
    importancia: text(),
    link: text(),
    teor: text(),
    providencia: text(),
  });

  carregar(op: OperacaoDetalheRow): void {
    this.tipoTravado.set(true);
    this.tipo.set(op.tipo);
    this.status.set(op.status ?? 'PENDENTE');
    this.origem.set(op.origem ?? 'CADASTRO_MANUAL');
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
      prazoFatal: instantParaDatetimeLocal(op.prazoFatal),
      horaInicio: op.horaInicio ?? '',
      horaFim: op.horaFim ?? '',
      importancia: op.importancia ?? '',
      link: op.link ?? '',
      teor: op.teor ?? '',
      providencia: op.providencia ?? '',
    });
  }

  limpar(): void {
    this.form.reset();
    this.tipoTravado.set(false);
    this.tipo.set('INTIMACAO');
    this.status.set('PENDENTE');
    this.origem.set('CADASTRO_MANUAL');
    this.responsavelId.set(null);
    this.responsavelLabel.set('');
  }

  validar(): OperacaoInformacoesGeraisValidacao {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      const mensagens = mensagensCamposInvalidos(this.form, ROTULOS_CAMPOS);
      return { ok: false, mensagem: `Preencha corretamente: ${mensagens.join('; ')}` };
    }
    return { ok: true };
  }

  coletar(): OperacaoInformacoesGeraisValores {
    const raw = this.form.getRawValue();
    const tarefaOuCompromisso = this.ehTarefaOuCompromisso();
    const intimacao = this.ehIntimacao();
    return {
      tipo: this.tipo(),
      titulo: raw.titulo.trim(),
      prazoFatal: datetimeLocalParaInstant(raw.prazoFatal),
      status: this.status(),
      responsavelId: this.responsavelId(),
      horaInicio: tarefaOuCompromisso ? raw.horaInicio || null : null,
      horaFim: tarefaOuCompromisso ? raw.horaFim || null : null,
      importancia: this.ehTarefa() ? raw.importancia || null : null,
      origem: intimacao ? this.origem() : null,
      link: intimacao ? raw.link.trim() || null : null,
      teor: intimacao ? raw.teor.trim() || null : null,
      providencia: intimacao ? raw.providencia.trim() || null : null,
    };
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

  protected origemRotulo(): string {
    return ORIGEM_OPERACAO_LABEL[this.origem()];
  }

  protected onOrigemChange(rotulo: string): void {
    const achado = ORIGENS.find((o) => ORIGEM_OPERACAO_LABEL[o] === rotulo);
    if (achado) {
      this.origem.set(achado);
    }
  }

  protected onResponsavelChange(valor: string): void {
    this.responsavelId.set(valor ? Number(valor) : null);
    this.responsavelLabel.set('');
  }
}
