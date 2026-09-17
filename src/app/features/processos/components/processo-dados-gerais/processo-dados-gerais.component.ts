import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  WritableSignal,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, ValidatorFn } from '@angular/forms';
import { switchMap } from 'rxjs';

import {
  documentoValidator,
  maskDocumento,
  maskNumeroCnj,
  numeroCnjCompleto,
} from '../../../../core/auth/documentos-br';
import { ComboboxComponent } from '../../../../shared/components/combobox/combobox.component';
import { DomainModelDropdownComponent } from '../../../../shared/components/domain-dropdown/domain-model-dropdown.component';
import { CnjMaskDirective } from '../../../../shared/directives/cnj-mask.directive';
import { DocumentoMaskDirective } from '../../../../shared/directives/documento-mask.directive';
import { mensagensCamposInvalidos } from '../../../../shared/utils/form-validacao';
import { DomainService, IDomainPage } from '../../../../core/services/domain.service';
import {
  ObservacaoProcessoApi,
  OrgaoProcessanteApi,
  ProcessoApi,
  ProcessoTribunalHistoricoApi,
  TIPO_PROCESSO_LABEL,
  TipoProcesso,
  TribunalAtualApi,
} from '../../services/processo-api.model';
import { ProcessoEditavel, ProcessoService } from '../../services/processo-service';

/** Item de um catálogo simples (`id`, `nome`) — Tribunal/OrgaoJulgador, via `/domain`. */
interface CatalogoItem {
  id: number;
  nome: string;
}

const TIPOS_PROCESSO: TipoProcesso[] = ['JUDICIAL', 'ADMINISTRATIVO', 'ARBITRAL'];

const ROTULOS_CAMPOS: Record<string, string> = {
  contrarioPrincipalDocumento: 'CPF/CNPJ da parte contrária',
};

/**
 * `FormGroup` dos campos de texto/data/textarea desta aba — sem arquivo de "factory" separado
 * (mesmo padrão de `AdvogadoFormComponent`/cev-front: geração e leitura do form ficam direto no
 * componente, não num arquivo à parte). Os campos que usam `<app-combobox>` e as listas ficam
 * em signals na classe, porque o combobox trabalha por `[value]`/`(valueChange)`, não por
 * `formControlName`.
 */
type ProcessoForm = FormGroup<{
  numeroCnj: FormControl<string>;
  contrarioPrincipalNome: FormControl<string>;
  contrarioPrincipalDocumento: FormControl<string>;
  dataDistribuicao: FormControl<string>;
  observacoesGerais: FormControl<string>;
  destacarObservacao: FormControl<boolean>;
}>;

function text(validators: ValidatorFn[] = []): FormControl<string> {
  return new FormControl('', { nonNullable: true, validators });
}

/** Resultado da validação da aba — o shell mostra `mensagem` no toast quando `ok` é `false`. */
export type DadosGeraisValidacao = { ok: true } | { ok: false; mensagem: string };

/**
 * Campos desta aba — o shell junta com `id` e com o que vem da aba "Outros envolvidos"
 * (`outrosEnvolvidos*`) pra montar o `ProcessoEditavel`.
 */
export type DadosGeraisValores = Omit<
  ProcessoEditavel,
  | 'id'
  | 'outrosEnvolvidosAdvogados'
  | 'outrosEnvolvidosMagistrados'
  | 'outrosEnvolvidosTestemunhas'
  | 'outrosEnvolvidosPeritos'
  | 'outrosEnvolvidosAssistentesTecnicos'
  | 'objetoPrincipal'
  | 'objetosSecundarios'
  | 'observacoesObjeto'
  | 'valorPedido'
  | 'valorDeferido'
  | 'cenarioProvavel'
  | 'cenarioPossivel'
  | 'cenarioRemoto'
>;

/**
 * Aba "Dados gerais" do painel de processo — dona do `FormGroup` (campos de texto/data), dos
 * signals dos campos de `<app-combobox>` / listas e do CRUD dos catálogos (status/posição/ação/
 * natureza/fase). O shell (`app-processo-form`) orquestra via `viewChild`: chama
 * `carregar` / `limpar` / `validar` / `coletar` e cuida de header / abas / rodapé / salvar / status.
 */
@Component({
  selector: 'app-processo-dados-gerais',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ComboboxComponent,
    DomainModelDropdownComponent,
    CnjMaskDirective,
    DocumentoMaskDirective,
  ],
  templateUrl: './processo-dados-gerais.component.html',
  styleUrl: './processo-dados-gerais.component.scss',
})
export class ProcessoDadosGeraisComponent {
  private readonly processoService = inject(ProcessoService);
  private readonly domainService = inject(DomainService);
  private readonly destroyRef = inject(DestroyRef);

  /** Erro numa operação de catálogo (criar/renomear/excluir) — o shell mostra no rodapé. */
  readonly erro = output<string>();

  /** Rótulos legíveis do tipo (o `<app-combobox>` estático mostra o texto que recebe). */
  protected readonly tipoOpcoes = TIPOS_PROCESSO.map((t) => TIPO_PROCESSO_LABEL[t]);
  /** `displayFormatter` do picker de município (`/domain/cidade`) — "Nome — UF". */
  protected readonly rotuloCidade = (item: Record<string, unknown>): string =>
    `${item['nome'] ?? ''} — ${item['uf'] ?? ''}`;
  /**
   * `displayFormatter` dos `<app-domain-model-dropdown>` — tipados como `Record<string, unknown>`
   * (não o tipo real da entidade) por limitação de inferência do compilador de templates do
   * Angular com componente genérico (`DomainModelDropdownComponent<T>`); o cast fica por conta de
   * quem lê o campo, aqui é só `nome`/`razaoSocial`/`nomeFantasia`, sem necessidade de cast.
   */
  protected readonly rotuloCatalogo = (item: Record<string, unknown>): string =>
    String(item['nome'] ?? '');
  protected readonly rotuloPessoa = (item: Record<string, unknown>): string =>
    String(item['nome'] ?? item['razaoSocial'] ?? item['nomeFantasia'] ?? '(sem nome)');
  protected readonly rotuloAdvogado = (item: Record<string, unknown>): string =>
    String(item['nome'] ?? '(sem nome)');

  // --- "Órgão processante" atual: cascata Tribunal → Órgão (filtrado pelo tribunal escolhido) ---
  /** Id do catálogo `tribunal` que vai no `PUT` — independente do órgão (dá pra ter só tribunal). */
  protected readonly tribunalAtualId = signal<number | null>(null);
  protected readonly tribunalAtualLabel = signal('');
  protected readonly tribunalAtualValor = computed(() =>
    this.tribunalAtualId() === null ? '' : String(this.tribunalAtualId()),
  );
  /** Id do catálogo `orgao-julgador` que vai no `PUT` — `null` = sem órgão processante definido. */
  protected readonly orgaoProcessanteId = signal<number | null>(null);
  protected readonly orgaoAtualLabel = signal('');
  protected readonly orgaoAtualValor = computed(() =>
    this.orgaoProcessanteId() === null ? '' : String(this.orgaoProcessanteId()),
  );
  /** RQL do dropdown de órgão — escopado ao tribunal escolhido (`id eq -1` = nunca casa, sem tribunal). */
  protected readonly orgaoAtualFiltro = computed(() => `tribunalId eq ${this.tribunalAtualId() ?? -1}`);

  protected readonly form: ProcessoForm = new FormGroup({
    numeroCnj: text(),
    contrarioPrincipalNome: text(),
    contrarioPrincipalDocumento: text([documentoValidator]),
    dataDistribuicao: text(),
    observacoesGerais: text(),
    destacarObservacao: new FormControl(false, { nonNullable: true }),
  });
  /**
   * Valor atual do campo de número — segue o que o usuário digita **e** o que é carregado por
   * `patchProcessoForm` (que roda com `emitEvent: false`, então `valueChanges` não cobre a carga;
   * `carregar` seta este signal explicitamente). Lido pelo shell pro título do painel.
   */
  readonly numeroValue = signal('');
  /** Feedback visual do botão "copiar número" (ícone vira ✓ por ~1,5s). */
  protected readonly numeroCopiado = signal(false);
  private copiadoTimer?: ReturnType<typeof setTimeout>;

  // Campos dirigidos por <app-combobox> / listas — fora do FormGroup.
  protected readonly tipo = signal<TipoProcesso>('JUDICIAL');
  /** Só o judicial numera pelo padrão CNJ (máscara + 20 dígitos obrigatórios). */
  protected readonly ehJudicial = computed(() => this.tipo() === 'JUDICIAL');
  /**
   * Status/Ação/Natureza/Fase — amarrados por id ao catálogo (V26), não mais só o texto. O
   * label vem direto da ficha carregada (`p.status`/`p.acao`/...) sem chamada HTTP extra: o
   * backend já manda o snapshot do nome junto do id (mesmo desenho de `cidade`/`cidadeId`).
   */
  protected readonly statusId = signal<number | null>(null);
  protected readonly statusLabel = signal('');
  protected readonly acaoId = signal<number | null>(null);
  protected readonly acaoLabel = signal('');
  protected readonly naturezaId = signal<number | null>(null);
  protected readonly naturezaLabel = signal('');
  protected readonly procedimentoId = signal<number | null>(null);
  protected readonly procedimentoLabel = signal('');
  protected readonly faseId = signal<number | null>(null);
  protected readonly faseLabel = signal('');
  /** Posição do cliente principal e da parte contrária — mesmo catálogo `PosicaoCliente` (V27). */
  protected readonly clientePrincipalPosicaoId = signal<number | null>(null);
  protected readonly clientePrincipalPosicaoLabel = signal('');
  protected readonly contrarioPrincipalPosicaoId = signal<number | null>(null);
  protected readonly contrarioPrincipalPosicaoLabel = signal('');
  protected readonly uf = signal('');
  /** Município escolhido no picker `cidades` (`null` = nenhum). Vira o snapshot de cidade/uf no back. */
  protected readonly cidadeId = signal<number | null>(null);
  protected readonly cidadeLabel = signal('');
  protected readonly clientePrincipalId = signal<number | null>(null);
  protected readonly clientePrincipalLabel = signal('');
  protected readonly advogadoResponsavelId = signal<number | null>(null);
  protected readonly advogadoResponsavelLabel = signal('');
  /** Id como string pro `[value]` do combobox (`''` = nenhum). */
  protected readonly clientePrincipalValor = computed(() =>
    this.clientePrincipalId() === null ? '' : String(this.clientePrincipalId()),
  );
  protected readonly advogadoResponsavelValor = computed(() =>
    this.advogadoResponsavelId() === null ? '' : String(this.advogadoResponsavelId()),
  );
  protected readonly cidadeValor = computed(() =>
    this.cidadeId() === null ? '' : String(this.cidadeId()),
  );
  protected readonly statusValor = computed(() => (this.statusId() === null ? '' : String(this.statusId())));
  protected readonly acaoValor = computed(() => (this.acaoId() === null ? '' : String(this.acaoId())));
  protected readonly naturezaValor = computed(() => (this.naturezaId() === null ? '' : String(this.naturezaId())));
  protected readonly faseValor = computed(() => (this.faseId() === null ? '' : String(this.faseId())));
  protected readonly procedimentoValor = computed(() =>
    this.procedimentoId() === null ? '' : String(this.procedimentoId()),
  );
  protected readonly clientePrincipalPosicaoValor = computed(() =>
    this.clientePrincipalPosicaoId() === null ? '' : String(this.clientePrincipalPosicaoId()),
  );
  protected readonly contrarioPrincipalPosicaoValor = computed(() =>
    this.contrarioPrincipalPosicaoId() === null ? '' : String(this.contrarioPrincipalPosicaoId()),
  );
  protected readonly tags = signal<string[]>([]);
  protected readonly escritoriosAnteriores = signal<string[]>([]);
  // Preservados como vieram — sem UI de edição nesta fatia.
  private clientesSecundarios: ProcessoApi['clientes_secundarios'] = [];
  private partesContrarias: ProcessoApi['partes_contrarias'] = [];

  /**
   * Histórico de "Observações gerais" — o backend arquiva a entrada automaticamente quando o
   * texto muda num `PUT` (ver `ProcessoService.arquivarObservacaoSeAlterada`). Só leitura;
   * ordenado do mais recente pro mais antigo.
   */
  private static readonly OBSERVACOES_POR_PAGINA = 5;
  /** Oculto por padrão — só abre quando o usuário clica em "Visualizar Histórico de observações". */
  protected readonly mostrarHistoricoObservacoes = signal(false);
  private readonly observacoesPrevias = signal<ObservacaoProcessoApi[]>([]);
  protected readonly historicoObservacoes = computed(() =>
    [...this.observacoesPrevias()].sort((a, b) => b.data.localeCompare(a.data)),
  );
  /** Página atual do histórico (0-based) — paginação só no front, a lista inteira já veio na ficha. */
  protected readonly paginaObservacoes = signal(0);
  protected readonly totalPaginasObservacoes = computed(() =>
    Math.max(
      1,
      Math.ceil(this.historicoObservacoes().length / ProcessoDadosGeraisComponent.OBSERVACOES_POR_PAGINA),
    ),
  );
  protected readonly observacoesPagina = computed(() => {
    const inicio = this.paginaObservacoes() * ProcessoDadosGeraisComponent.OBSERVACOES_POR_PAGINA;
    return this.historicoObservacoes().slice(
      inicio,
      inicio + ProcessoDadosGeraisComponent.OBSERVACOES_POR_PAGINA,
    );
  });

  /**
   * Histórico de tribunais responsáveis pelo processo — o backend registra automaticamente
   * quando um órgão novo entra em "Órgãos processantes" (ver `ProcessoService`). Só leitura;
   * ordenado do mais recente pro mais antigo, paginado de 5 em 5 (mesmo padrão de observações).
   */
  private static readonly TRIBUNAIS_POR_PAGINA = 5;
  /** Oculto por padrão — só abre quando o usuário clica em "Visualizar Histórico de tribunais...". */
  protected readonly mostrarHistoricoTribunais = signal(false);
  private readonly tribunaisHistorico = signal<ProcessoTribunalHistoricoApi[]>([]);
  protected readonly historicoTribunais = computed(() =>
    [...this.tribunaisHistorico()].sort((a, b) => b.data.localeCompare(a.data)),
  );
  protected readonly paginaTribunais = signal(0);
  protected readonly totalPaginasTribunais = computed(() =>
    Math.max(
      1,
      Math.ceil(this.historicoTribunais().length / ProcessoDadosGeraisComponent.TRIBUNAIS_POR_PAGINA),
    ),
  );
  protected readonly tribunaisPagina = computed(() => {
    const inicio = this.paginaTribunais() * ProcessoDadosGeraisComponent.TRIBUNAIS_POR_PAGINA;
    return this.historicoTribunais().slice(
      inicio,
      inicio + ProcessoDadosGeraisComponent.TRIBUNAIS_POR_PAGINA,
    );
  });

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.copiadoTimer));

    this.form.controls.numeroCnj.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((v) => this.numeroValue.set(v ?? ''));
  }

  // ===================== API pro shell =====================

  /** Preenche a aba com uma ficha carregada. */
  carregar(p: ProcessoApi): void {
    this.form.patchValue(
      {
        numeroCnj: p.numero_cnj ?? '',
        contrarioPrincipalNome: p.contrario_principal_nome ?? '',
        contrarioPrincipalDocumento: maskDocumento(p.contrario_principal_documento),
        dataDistribuicao: p.data_distribuicao ?? '',
        observacoesGerais: p.observacoes_gerais ?? '',
        destacarObservacao: p.destacar_observacao,
      },
      { emitEvent: false },
    );
    this.form.markAsPristine();
    this.form.markAsUntouched();
    this.form.updateValueAndValidity({ emitEvent: false });
    this.numeroValue.set(p.numero_cnj ?? '');
    this.tipo.set(p.tipo);
    this.statusId.set(p.status_id);
    this.statusLabel.set(p.status ?? '');
    this.acaoId.set(p.acao_id);
    this.acaoLabel.set(p.acao ?? '');
    this.naturezaId.set(p.natureza_id);
    this.naturezaLabel.set(p.natureza ?? '');
    this.procedimentoId.set(p.procedimento_id);
    this.procedimentoLabel.set(p.procedimento ?? '');
    this.faseId.set(p.fase_id);
    this.faseLabel.set(p.fase ?? '');
    this.clientePrincipalPosicaoId.set(p.cliente_principal_posicao_id);
    this.clientePrincipalPosicaoLabel.set(p.cliente_principal_posicao ?? '');
    this.contrarioPrincipalPosicaoId.set(p.contrario_principal_posicao_id);
    this.contrarioPrincipalPosicaoLabel.set(p.contrario_principal_posicao ?? '');
    this.uf.set(p.uf ?? '');
    this.cidadeId.set(p.cidade_id);
    this.cidadeLabel.set(p.cidade_id !== null ? `${p.cidade ?? ''} — ${p.uf ?? ''}` : '');
    this.tags.set([...p.tags]);
    this.aplicarTribunalProcessante(p.tribunal_atual, p.orgao_processante);
    this.escritoriosAnteriores.set([...p.escritorios_anteriores]);
    this.clientesSecundarios = p.clientes_secundarios;
    this.partesContrarias = p.partes_contrarias;
    this.observacoesPrevias.set(p.observacoes_previas);
    this.paginaObservacoes.set(0);
    this.tribunaisHistorico.set(p.tribunais_historico);
    this.paginaTribunais.set(0);
    // `mostrarHistoricoObservacoes`/`mostrarHistoricoTribunais` não são resetados aqui de
    // propósito: são preferência do usuário, não dado do processo — ficam abertos entre saves e
    // ao trocar de processo, só fecham se ele fechar.

    this.clientePrincipalId.set(p.cliente_principal_id);
    this.clientePrincipalLabel.set('');
    if (p.cliente_principal_id !== null) {
      this.processoService
        .rotuloPessoa(p.cliente_principal_id)
        .subscribe((nome) => this.clientePrincipalLabel.set(nome));
    }
    this.advogadoResponsavelId.set(p.advogado_responsavel_id);
    this.advogadoResponsavelLabel.set('');
    if (p.advogado_responsavel_id !== null) {
      this.processoService
        .rotuloAdvogado(p.advogado_responsavel_id)
        .subscribe((nome) => this.advogadoResponsavelLabel.set(nome));
    }
  }

  /** Zera a aba (novo cadastro). */
  limpar(): void {
    this.form.reset();
    this.numeroValue.set('');
    this.tipo.set('JUDICIAL');
    this.statusId.set(null);
    this.statusLabel.set('');
    this.acaoId.set(null);
    this.acaoLabel.set('');
    this.naturezaId.set(null);
    this.naturezaLabel.set('');
    this.procedimentoId.set(null);
    this.procedimentoLabel.set('');
    this.faseId.set(null);
    this.faseLabel.set('');
    this.clientePrincipalPosicaoId.set(null);
    this.clientePrincipalPosicaoLabel.set('');
    this.contrarioPrincipalPosicaoId.set(null);
    this.contrarioPrincipalPosicaoLabel.set('');
    this.uf.set('');
    this.cidadeId.set(null);
    this.cidadeLabel.set('');
    this.clientePrincipalId.set(null);
    this.clientePrincipalLabel.set('');
    this.advogadoResponsavelId.set(null);
    this.advogadoResponsavelLabel.set('');
    this.tags.set([]);
    this.aplicarTribunalProcessante(null, null);
    this.escritoriosAnteriores.set([]);
    this.clientesSecundarios = [];
    this.partesContrarias = [];
    this.observacoesPrevias.set([]);
    this.paginaObservacoes.set(0);
    this.tribunaisHistorico.set([]);
    this.paginaTribunais.set(0);
    // Mesmo motivo do `carregar`: preferência do usuário, não reseta ao limpar o painel.
  }

  /** Valida antes de salvar; marca os campos e devolve o motivo pro shell mostrar no toast. */
  validar(): DadosGeraisValidacao {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      const mensagens = mensagensCamposInvalidos(this.form, ROTULOS_CAMPOS);
      return { ok: false, mensagem: `Preencha corretamente: ${mensagens.join('; ')}` };
    }
    if (this.ehJudicial() && !numeroCnjCompleto(this.form.controls.numeroCnj.value)) {
      this.form.controls.numeroCnj.markAsTouched();
      return {
        ok: false,
        mensagem: 'Informe o número CNJ completo (0000000-00.0000.0.00.0000).',
      };
    }
    return { ok: true };
  }

  /** Junta FormGroup + signals no payload de escrita (sem o `id`, que é do shell). */
  coletar(): DadosGeraisValores {
    const raw = this.form.getRawValue();
    return {
      tipo: this.tipo(),
      numeroCnj: raw.numeroCnj,
      statusId: this.statusId(),
      clientePrincipalId: this.clientePrincipalId(),
      clientePrincipalPosicaoId: this.clientePrincipalPosicaoId(),
      contrarioPrincipalNome: raw.contrarioPrincipalNome,
      contrarioPrincipalPosicaoId: this.contrarioPrincipalPosicaoId(),
      contrarioPrincipalDocumento: raw.contrarioPrincipalDocumento,
      advogadoResponsavelId: this.advogadoResponsavelId(),
      dataDistribuicao: raw.dataDistribuicao,
      acaoId: this.acaoId(),
      naturezaId: this.naturezaId(),
      procedimentoId: this.procedimentoId(),
      faseId: this.faseId(),
      uf: this.uf(),
      cidadeId: this.cidadeId(),
      observacoesGerais: raw.observacoesGerais,
      destacarObservacao: raw.destacarObservacao,
      tags: this.tags(),
      tribunalAtualId: this.tribunalAtualId(),
      orgaoProcessanteId: this.orgaoProcessanteId(),
      escritoriosAnteriores: this.escritoriosAnteriores(),
      clientesSecundarios: this.clientesSecundarios,
      partesContrarias: this.partesContrarias,
    };
  }

  // ===================== campos =====================

  protected tipoRotulo(): string {
    return TIPO_PROCESSO_LABEL[this.tipo()];
  }

  protected onTipoChange(rotulo: string): void {
    const achado = TIPOS_PROCESSO.find((t) => TIPO_PROCESSO_LABEL[t] === rotulo);
    if (!achado) {
      return;
    }
    this.tipo.set(achado);
    // Ao virar judicial, formata o que já estava digitado; ao sair, mantém o texto como está.
    if (achado === 'JUDICIAL') {
      const numero = this.form.controls.numeroCnj;
      numero.setValue(maskNumeroCnj(numero.value));
    }
  }

  protected onClientePrincipalChange(valor: string): void {
    this.clientePrincipalId.set(valor ? Number(valor) : null);
    this.clientePrincipalLabel.set('');
  }

  protected onStatusChange(valor: string): void {
    this.statusId.set(valor ? Number(valor) : null);
    this.statusLabel.set('');
  }

  protected onAcaoChange(valor: string): void {
    this.acaoId.set(valor ? Number(valor) : null);
    this.acaoLabel.set('');
  }

  protected onNaturezaChange(valor: string): void {
    this.naturezaId.set(valor ? Number(valor) : null);
    this.naturezaLabel.set('');
  }

  protected onFaseChange(valor: string): void {
    this.faseId.set(valor ? Number(valor) : null);
    this.faseLabel.set('');
  }

  protected onProcedimentoChange(valor: string): void {
    this.procedimentoId.set(valor ? Number(valor) : null);
    this.procedimentoLabel.set('');
  }

  protected onClientePrincipalPosicaoChange(valor: string): void {
    this.clientePrincipalPosicaoId.set(valor ? Number(valor) : null);
    this.clientePrincipalPosicaoLabel.set('');
  }

  protected onContrarioPrincipalPosicaoChange(valor: string): void {
    this.contrarioPrincipalPosicaoId.set(valor ? Number(valor) : null);
    this.contrarioPrincipalPosicaoLabel.set('');
  }

  protected onAdvogadoResponsavelChange(valor: string): void {
    this.advogadoResponsavelId.set(valor ? Number(valor) : null);
    this.advogadoResponsavelLabel.set('');
  }

  /** `(itemSelected)` do dropdown — item cru (`/domain`, camelCase) ou `null` (limpou a seleção). */
  protected onCidadeSelected(item: Record<string, unknown> | null): void {
    this.cidadeId.set(item ? Number(item['id']) : null);
    if (!item) {
      this.cidadeLabel.set('');
      return;
    }
    const nome = String(item['nome'] ?? '');
    const uf = String(item['uf'] ?? '');
    this.cidadeLabel.set(`${nome} — ${uf}`);
    this.uf.set(uf);
  }

  /** Copia o número (CNJ ou livre) pro clipboard e pisca o ✓ por ~1,5s. */
  protected copiarNumero(): void {
    const valor = this.numeroValue().trim();
    if (!valor || !navigator.clipboard) {
      return;
    }
    navigator.clipboard.writeText(valor).then(() => {
      this.numeroCopiado.set(true);
      clearTimeout(this.copiadoTimer);
      this.copiadoTimer = setTimeout(() => this.numeroCopiado.set(false), 1500);
    });
  }

  // --- catálogo "Status do processo" — CRUD via `/domain/status-processo` (ver `ProcessoService`) ---

  protected criarStatus(nome: string): void {
    this.processoService.criarCatalogo('status-processo', nome).subscribe({
      next: (s) => {
        this.statusId.set(s.id);
        this.statusLabel.set(s.nome);
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected renomearStatus({ de, para }: { de: string; para: string }): void {
    const id = Number(de);
    this.processoService.renomearCatalogo('status-processo', id, para).subscribe({
      next: (s) => {
        if (this.statusId() === id) {
          this.statusLabel.set(s.nome);
        }
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected excluirStatus(valor: string): void {
    const id = Number(valor);
    this.processoService.excluirCatalogo('status-processo', id).subscribe({
      next: () => {
        if (this.statusId() === id) {
          this.statusId.set(null);
          this.statusLabel.set('');
        }
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  // --- catálogo "Posição do cliente" — CRUD via `/domain/posicao-cliente` (ver `ProcessoService`);
  // alimenta os dois campos de posição (cliente principal e parte contrária), mesmo catálogo ---

  /** Os dois pares id/label que apontam pro catálogo; renomear/excluir propaga pros dois. */
  private posicoesEmUso(): { id: WritableSignal<number | null>; label: WritableSignal<string> }[] {
    return [
      { id: this.clientePrincipalPosicaoId, label: this.clientePrincipalPosicaoLabel },
      { id: this.contrarioPrincipalPosicaoId, label: this.contrarioPrincipalPosicaoLabel },
    ];
  }

  protected criarPosicaoCliente(
    nome: string,
    idAlvo: WritableSignal<number | null>,
    labelAlvo: WritableSignal<string>,
  ): void {
    this.processoService.criarCatalogo('posicao-cliente', nome).subscribe({
      next: (p) => {
        idAlvo.set(p.id);
        labelAlvo.set(p.nome);
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected renomearPosicaoCliente({ de, para }: { de: string; para: string }): void {
    const id = Number(de);
    this.processoService.renomearCatalogo('posicao-cliente', id, para).subscribe({
      next: (p) => {
        for (const campo of this.posicoesEmUso()) {
          if (campo.id() === id) {
            campo.label.set(p.nome);
          }
        }
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected excluirPosicaoCliente(valor: string): void {
    const id = Number(valor);
    this.processoService.excluirCatalogo('posicao-cliente', id).subscribe({
      next: () => {
        for (const campo of this.posicoesEmUso()) {
          if (campo.id() === id) {
            campo.id.set(null);
            campo.label.set('');
          }
        }
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  // --- catálogo "Ação" — CRUD via `/domain/acao-processo` (ver `ProcessoService`) ---

  protected criarAcao(nome: string): void {
    this.processoService.criarCatalogo('acao-processo', nome).subscribe({
      next: (a) => {
        this.acaoId.set(a.id);
        this.acaoLabel.set(a.nome);
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected renomearAcao({ de, para }: { de: string; para: string }): void {
    const id = Number(de);
    this.processoService.renomearCatalogo('acao-processo', id, para).subscribe({
      next: (a) => {
        if (this.acaoId() === id) {
          this.acaoLabel.set(a.nome);
        }
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected excluirAcao(valor: string): void {
    const id = Number(valor);
    this.processoService.excluirCatalogo('acao-processo', id).subscribe({
      next: () => {
        if (this.acaoId() === id) {
          this.acaoId.set(null);
          this.acaoLabel.set('');
        }
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  // --- catálogo "Natureza" — CRUD via `/domain/natureza-processo` (ver `ProcessoService`) ---

  protected criarNatureza(nome: string): void {
    this.processoService.criarCatalogo('natureza-processo', nome).subscribe({
      next: (n) => {
        this.naturezaId.set(n.id);
        this.naturezaLabel.set(n.nome);
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected renomearNatureza({ de, para }: { de: string; para: string }): void {
    const id = Number(de);
    this.processoService.renomearCatalogo('natureza-processo', id, para).subscribe({
      next: (n) => {
        if (this.naturezaId() === id) {
          this.naturezaLabel.set(n.nome);
        }
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected excluirNatureza(valor: string): void {
    const id = Number(valor);
    this.processoService.excluirCatalogo('natureza-processo', id).subscribe({
      next: () => {
        if (this.naturezaId() === id) {
          this.naturezaId.set(null);
          this.naturezaLabel.set('');
        }
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  // --- catálogo "Procedimento" — CRUD via `/domain/procedimento-processo` (ver `ProcessoService`) ---

  protected criarProcedimento(nome: string): void {
    this.processoService.criarCatalogo('procedimento-processo', nome).subscribe({
      next: (p) => {
        this.procedimentoId.set(p.id);
        this.procedimentoLabel.set(p.nome);
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected renomearProcedimento({ de, para }: { de: string; para: string }): void {
    const id = Number(de);
    this.processoService.renomearCatalogo('procedimento-processo', id, para).subscribe({
      next: (p) => {
        if (this.procedimentoId() === id) {
          this.procedimentoLabel.set(p.nome);
        }
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected excluirProcedimento(valor: string): void {
    const id = Number(valor);
    this.processoService.excluirCatalogo('procedimento-processo', id).subscribe({
      next: () => {
        if (this.procedimentoId() === id) {
          this.procedimentoId.set(null);
          this.procedimentoLabel.set('');
        }
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  // --- catálogo "Fase" — CRUD via `/domain/fase-processo` (ver `ProcessoService`) ---

  protected criarFase(nome: string): void {
    this.processoService.criarCatalogo('fase-processo', nome).subscribe({
      next: (f) => {
        this.faseId.set(f.id);
        this.faseLabel.set(f.nome);
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected renomearFase({ de, para }: { de: string; para: string }): void {
    const id = Number(de);
    this.processoService.renomearCatalogo('fase-processo', id, para).subscribe({
      next: (f) => {
        if (this.faseId() === id) {
          this.faseLabel.set(f.nome);
        }
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected excluirFase(valor: string): void {
    const id = Number(valor);
    this.processoService.excluirCatalogo('fase-processo', id).subscribe({
      next: () => {
        if (this.faseId() === id) {
          this.faseId.set(null);
          this.faseLabel.set('');
        }
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  // --- "Órgão processante" atual: cascata Tribunal → Órgão (ver signals/computed acima) ---

  /**
   * Troca de tribunal invalida o órgão escolhido antes (lista de opções muda). Quando o tribunal
   * tem um único órgão (caso comum: CCBC, INSS, STF, STJ, TST…), escolhe-o automaticamente — sem
   * isso, escolher só o tribunal não definia nada e o "Salvar" gravava órgão processante vazio.
   */
  protected onTribunalAtualChange(valor: string): void {
    const id = valor ? Number(valor) : null;
    this.tribunalAtualId.set(id);
    this.tribunalAtualLabel.set('');
    this.orgaoProcessanteId.set(null);
    this.orgaoAtualLabel.set('');
    if (id === null) {
      return;
    }
    this.domainService
      .get<IDomainPage<CatalogoItem>>({
        entityName: 'orgao-julgador',
        filter: `tribunalId eq ${id}`,
        fields: 'id,nome',
        size: 2,
      })
      .subscribe({
        next: (pagina) => {
          if (pagina.content.length === 1 && this.tribunalAtualId() === id) {
            this.orgaoProcessanteId.set(pagina.content[0].id);
            this.orgaoAtualLabel.set(pagina.content[0].nome);
          }
        },
        error: () => {
          // conveniência (auto-seleção) — falha aqui não deve bloquear o fluxo principal.
        },
      });
  }

  protected criarTribunalProcessante(nome: string): void {
    this.processoService.criarCatalogo('tribunal', nome).subscribe({
      next: (t) => this.onTribunalAtualChange(String(t.id)),
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected renomearTribunalProcessante({ de, para }: { de: string; para: string }): void {
    const id = Number(de);
    this.processoService.renomearCatalogo('tribunal', id, para).subscribe({
      next: (t) => {
        if (this.tribunalAtualId() === id) {
          this.tribunalAtualLabel.set(t.nome);
        }
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected excluirTribunalProcessante(valor: string): void {
    const id = Number(valor);
    this.processoService.excluirCatalogo('tribunal', id).subscribe({
      next: () => {
        if (this.tribunalAtualId() === id) {
          this.onTribunalAtualChange('');
        }
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  /** Escolher o órgão JÁ define o "órgão processante" atual — sem passo de "Adicionar". */
  protected onOrgaoAtualChange(valor: string): void {
    this.orgaoProcessanteId.set(valor ? Number(valor) : null);
    this.orgaoAtualLabel.set('');
  }

  protected criarOrgaoDoTribunalAtual(nome: string): void {
    const tribunalId = this.tribunalAtualId();
    if (!tribunalId) {
      return;
    }
    this.domainService
      .post<{ tribunal_id: number; nome: string }>({
        entityName: 'orgao-julgador',
        body: { tribunal_id: tribunalId, nome },
      })
      .pipe(
        switchMap((criado) =>
          this.domainService.get<CatalogoItem>({ entityName: 'orgao-julgador', entityId: criado.id, fields: 'id,nome' }),
        ),
      )
      .subscribe({
        next: (o) => {
          this.orgaoProcessanteId.set(o.id);
          this.orgaoAtualLabel.set(o.nome);
        },
        error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
      });
  }

  protected renomearOrgaoDoTribunalAtual({ de, para }: { de: string; para: string }): void {
    const id = Number(de);
    this.processoService.renomearCatalogo('orgao-julgador', id, para).subscribe({
      next: (o) => {
        if (this.orgaoProcessanteId() === id) {
          this.orgaoAtualLabel.set(o.nome);
        }
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected excluirOrgaoDoTribunalAtual(valor: string): void {
    const id = Number(valor);
    this.processoService.excluirCatalogo('orgao-julgador', id).subscribe({
      next: () => {
        if (this.orgaoProcessanteId() === id) {
          this.orgaoProcessanteId.set(null);
          this.orgaoAtualLabel.set('');
        }
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  /**
   * Deriva tribunal/órgão exibidos nos dois dropdown a partir do "tribunal atual" e do "órgão
   * processante" da ficha — independentes: pode ter só tribunal, sem nenhum órgão específico.
   * `orgao.nome`/`tribunalAtual.nome` já vêm resolvidos pelo back (ver `ProcessoService` Java,
   * `OrgaoJulgadorResponse`/`TribunalResponse` — inalterados por esta migração), com o órgão no
   * formato "TRIBUNAL - descrição" — por isso o split aqui, só pra exibição inicial.
   */
  private aplicarTribunalProcessante(
    tribunalAtual: TribunalAtualApi | null, orgao: OrgaoProcessanteApi | null,
  ): void {
    if (orgao) {
      const separador = orgao.nome.indexOf(' - ');
      this.tribunalAtualId.set(orgao.tribunal_id);
      this.tribunalAtualLabel.set(separador >= 0 ? orgao.nome.slice(0, separador) : orgao.nome);
      this.orgaoProcessanteId.set(orgao.id);
      this.orgaoAtualLabel.set(separador >= 0 ? orgao.nome.slice(separador + 3) : '');
      return;
    }
    if (tribunalAtual) {
      this.tribunalAtualId.set(tribunalAtual.id);
      this.tribunalAtualLabel.set(tribunalAtual.nome);
      this.orgaoProcessanteId.set(null);
      this.orgaoAtualLabel.set('');
      return;
    }
    this.tribunalAtualId.set(null);
    this.tribunalAtualLabel.set('');
    this.orgaoProcessanteId.set(null);
    this.orgaoAtualLabel.set('');
  }

  // --- listas de texto livre (tags / escritórios) ---

  protected adicionarTag(valor: string): void {
    this.adicionarNaLista(this.tags, valor);
  }

  protected removerTag(indice: number): void {
    this.removerDaLista(this.tags, indice);
  }

  protected adicionarEscritorio(valor: string): void {
    this.adicionarNaLista(this.escritoriosAnteriores, valor);
  }

  protected removerEscritorio(indice: number): void {
    this.removerDaLista(this.escritoriosAnteriores, indice);
  }

  private adicionarNaLista(lista: WritableSignal<string[]>, valor: string): void {
    const limpo = valor.trim();
    if (limpo && !lista().includes(limpo)) {
      lista.update((atual) => [...atual, limpo]);
    }
  }

  private removerDaLista(lista: WritableSignal<string[]>, indice: number): void {
    lista.update((atual) => atual.filter((_, i) => i !== indice));
  }

  /** `data` da observação (ISO, `Instant`) formatada como data e hora pt-BR. */
  protected formatarDataHora(data: string): string {
    return new Date(data).toLocaleString('pt-BR');
  }

  /**
   * Rótulo de uma linha do histórico de tribunais — "TRIBUNAL — órgão", ou só "TRIBUNAL" quando
   * não havia órgão (não é "excluído": pode simplesmente nunca ter sido definido).
   */
  protected rotuloHistoricoTribunal(h: ProcessoTribunalHistoricoApi): string {
    const tribunal = h.tribunal_nome ?? 'Tribunal excluído';
    return h.orgao_nome ? `${tribunal} — ${h.orgao_nome}` : tribunal;
  }

  protected toggleHistoricoObservacoes(): void {
    this.mostrarHistoricoObservacoes.update((v) => !v);
  }

  protected toggleHistoricoTribunais(): void {
    this.mostrarHistoricoTribunais.update((v) => !v);
  }

  protected paginaObservacoesAnterior(): void {
    this.paginaObservacoes.update((p) => Math.max(0, p - 1));
  }

  protected paginaObservacoesProxima(): void {
    this.paginaObservacoes.update((p) => Math.min(this.totalPaginasObservacoes() - 1, p + 1));
  }

  protected paginaTribunaisAnterior(): void {
    this.paginaTribunais.update((p) => Math.max(0, p - 1));
  }

  protected paginaTribunaisProxima(): void {
    this.paginaTribunais.update((p) => Math.min(this.totalPaginasTribunais() - 1, p + 1));
  }

  private mensagemErroHttp(err: unknown): string {
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
