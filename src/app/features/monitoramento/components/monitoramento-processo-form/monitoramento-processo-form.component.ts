import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { DomainModelDropdownComponent } from '../../../../shared/components/domain-dropdown/domain-model-dropdown.component';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { ToastService } from '../../../../shared/services/toast.service';
import {
  MonitoramentoProcessoCorpo,
  MonitoramentoProcessoRow,
  MonitoramentoService,
  ProcessoCadastradoRow,
} from '../../services/monitoramento.service';

/** O que o formulário avisa ao salvar — a tela recarrega a lista e, se pedido, consulta as fontes. */
export interface ProcessoSalvo {
  id: number;
  numeroCnj: string;
  consultarFontes: boolean;
}

const SEGMENTO: Record<string, string> = {
  '1': 'STF',
  '2': 'CNJ',
  '3': 'STJ',
  '4': 'Justiça Federal',
  '5': 'Justiça do Trabalho',
  '6': 'Justiça Eleitoral',
  '7': 'Justiça Militar da União',
  '8': 'Justiça Estadual',
  '9': 'Justiça Militar Estadual',
};

/** Máscara progressiva `NNNNNNN-DD.AAAA.J.TR.OOOO` sobre os dígitos digitados (até 20). */
function mascarar(digitos: string): string {
  const partes: [number, number, string][] = [
    [0, 7, ''],
    [7, 9, '-'],
    [9, 13, '.'],
    [13, 14, '.'],
    [14, 16, '.'],
    [16, 20, '.'],
  ];
  return partes.filter(([ini]) => digitos.length > ini).map(([ini, fim, sep]) => sep + digitos.slice(ini, fim)).join('');
}

/** MOD 97-10 da Resolução CNJ 65/2008 — mesma regra do `NumeroCnjUtils` do backend. */
function digitoVerificadorValido(digitos: string): boolean {
  if (digitos.length !== 20) {
    return false;
  }
  const reordenado = digitos.slice(0, 7) + digitos.slice(9) + digitos.slice(7, 9);
  return BigInt(reordenado) % 97n === 1n;
}

type AvisoCnj = { tom: 'neutro' | 'erro' | 'ok'; texto: string };

/**
 * Formulário de um processo do monitoramento (adicionar ou editar): número CNJ, cliente,
 * contrário, ação, status e observação. O número recebe máscara enquanto é digitado e o dígito
 * verificador é conferido aqui mesmo (o backend confere de novo). Número que já está no cadastro
 * de processos oferece "Usar dados do cadastro" (cliente e contrário principais).
 *
 * "Salvar e adicionar outro" (só ao adicionar) grava, limpa o número/contrário/observação e
 * mantém cliente, ação e status — quem cadastra uma carteira costuma repetir o mesmo cliente.
 */
@Component({
  selector: 'app-monitoramento-processo-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, ButtonComponent, DomainModelDropdownComponent],
  templateUrl: './monitoramento-processo-form.component.html',
  styleUrl: './monitoramento-processo-form.component.scss',
})
export class MonitoramentoProcessoFormComponent {
  private readonly service = inject(MonitoramentoService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly monitoramentoId = input.required<number>();
  readonly monitoramentoNome = input<string>('');
  /** Linha a editar; `null` = adicionar. */
  readonly processo = input<MonitoramentoProcessoRow | null>(null);

  readonly salvo = output<ProcessoSalvo>();
  readonly fechar = output<void>();

  protected readonly numero = signal('');
  protected readonly cliente = signal('');
  protected readonly contrario = signal('');
  protected readonly acaoId = signal<number | null>(null);
  protected readonly acaoLabel = signal('');
  protected readonly statusId = signal<number | null>(null);
  protected readonly statusLabel = signal('');
  protected readonly observacao = signal('');
  protected readonly consultarAoSalvar = signal(true);
  protected readonly salvando = signal(false);
  protected readonly cadastrado = signal<ProcessoCadastradoRow | null>(null);
  /** Números salvos nesta abertura do formulário via "Salvar e adicionar outro". */
  protected readonly adicionados = signal<string[]>([]);

  protected readonly editando = computed(() => this.processo() !== null);
  protected readonly titulo = computed(() => (this.editando() ? 'Editar processo' : 'Adicionar processo'));
  private readonly digitos = computed(() => this.numero().replace(/\D/g, ''));
  protected readonly numeroValido = computed(() => digitoVerificadorValido(this.digitos()));

  protected readonly avisoCnj = computed<AvisoCnj>(() => {
    const d = this.digitos();
    if (d.length === 0) {
      return { tom: 'neutro', texto: 'Digite os 20 dígitos; a máscara entra sozinha.' };
    }
    if (d.length < 20) {
      return { tom: 'neutro', texto: `Faltam ${20 - d.length} dígito(s).` };
    }
    if (!this.numeroValido()) {
      return { tom: 'erro', texto: 'O dígito verificador não confere. Confira o número.' };
    }
    const segmento = SEGMENTO[d.charAt(13)] ?? '';
    return { tom: 'ok', texto: `Número válido · ${segmento} · tribunal ${d.slice(14, 16)}` };
  });

  protected readonly podeSalvar = computed(
    () => this.numeroValido() && this.cliente().trim().length > 0 && !this.salvando(),
  );

  protected readonly rotuloCatalogo = (item: Record<string, unknown>): string => String(item['nome'] ?? '');

  constructor() {
    effect(() => {
      const p = this.processo();
      if (p) {
        this.numero.set(p.numeroCnj);
        this.cliente.set(p.cliente);
        this.contrario.set(p.contrario ?? '');
        this.acaoId.set(p.acaoId);
        this.acaoLabel.set(p.acao ?? '');
        this.statusId.set(p.statusId);
        this.statusLabel.set(p.status ?? '');
        this.observacao.set(p.observacao ?? '');
      }
    });

    // Número completo e válido: procura o mesmo número no cadastro de processos (só ao adicionar).
    effect((onCleanup) => {
      const valido = this.numeroValido();
      const numero = this.numero();
      this.cadastrado.set(null);
      if (!valido || this.editando()) {
        return;
      }
      const busca = this.service
        .processoCadastrado(numero)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({ next: (p) => this.cadastrado.set(p), error: () => this.cadastrado.set(null) });
      onCleanup(() => busca.unsubscribe());
    });
  }

  protected onNumeroInput(event: Event): void {
    const campo = event.target as HTMLInputElement;
    const mascarado = mascarar(campo.value.replace(/\D/g, '').slice(0, 20));
    this.numero.set(mascarado);
    campo.value = mascarado;
  }

  protected onTexto(sinal: 'cliente' | 'contrario' | 'observacao', event: Event): void {
    this[sinal].set((event.target as HTMLInputElement | HTMLTextAreaElement).value);
  }

  protected onAcao(valor: string): void {
    this.acaoId.set(valor ? Number(valor) : null);
  }

  protected onStatus(valor: string): void {
    this.statusId.set(valor ? Number(valor) : null);
  }

  protected usarCadastro(): void {
    const p = this.cadastrado();
    if (p) {
      this.cliente.set(p.clientePrincipalNome ?? this.cliente());
      this.contrario.set(p.contrarioPrincipalNome ?? this.contrario());
    }
  }

  protected salvar(continuar: boolean): void {
    if (!this.podeSalvar()) {
      return;
    }
    this.salvando.set(true);
    const corpo: MonitoramentoProcessoCorpo = {
      numero_cnj: this.numero(),
      cliente: this.cliente().trim(),
      contrario: this.contrario().trim() || null,
      acao_id: this.acaoId(),
      status_id: this.statusId(),
      observacao: this.observacao().trim() || null,
    };
    const processo = this.processo();
    const requisicao = processo
      ? this.service.editarProcesso(processo.id, corpo).pipe(map(() => processo.id))
      : this.service.adicionarProcesso({ ...corpo, monitoramento_id: this.monitoramentoId() });
    requisicao.subscribe({
      next: (id) => {
        this.salvando.set(false);
        const numeroCnj = this.numero();
        this.salvo.emit({
          id,
          numeroCnj,
          consultarFontes: !processo && this.consultarAoSalvar(),
        });
        if (continuar) {
          this.adicionados.update((lista) => [...lista, numeroCnj]);
          this.numero.set('');
          this.contrario.set('');
          this.observacao.set('');
        } else {
          this.fechar.emit();
        }
      },
      error: (err: unknown) => {
        this.salvando.set(false);
        this.toast.erro(`Não foi possível salvar: ${mensagemErro(err)}`);
      },
    });
  }
}

function mensagemErro(err: unknown): string {
  const e = err as { error?: { detail?: string; title?: string; message?: string }; message?: string; status?: number };
  if (e?.status === 0) {
    return 'Sem conexão com o servidor.';
  }
  return e?.error?.detail || e?.error?.title || e?.error?.message || e?.message || 'erro inesperado.';
}
