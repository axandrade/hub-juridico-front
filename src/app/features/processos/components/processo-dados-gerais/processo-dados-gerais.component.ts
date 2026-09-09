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
import { ReactiveFormsModule } from '@angular/forms';

import { maskNumeroCnj, numeroCnjCompleto } from '../../../../core/auth/documentos-br';
import { ComboboxComponent } from '../../../../shared/components/combobox/combobox.component';
import { CnjMaskDirective } from '../../../../shared/directives/cnj-mask.directive';
import { DocumentoMaskDirective } from '../../../../shared/directives/documento-mask.directive';
import { ProcessoApi, TIPO_PROCESSO_LABEL, TipoProcesso } from '../../services/processo-api.model';
import { AcaoProcessoService } from '../../services/acao-processo.service';
import { CidadeService } from '../../services/cidade-service';
import { FaseProcessoService } from '../../services/fase-processo.service';
import { NaturezaProcessoService } from '../../services/natureza-processo.service';
import { PosicaoClienteService } from '../../services/posicao-cliente.service';
import { ProcessoEditavel, ProcessoService } from '../../services/processo-service';
import { StatusProcessoService } from '../../services/status-processo.service';
import {
  ProcessoForm,
  createProcessoForm,
  patchProcessoForm,
} from '../../forms/processo-form.factory';

const TIPOS_PROCESSO: TipoProcesso[] = ['JUDICIAL', 'ADMINISTRATIVO', 'ARBITRAL'];

/** Resultado da validação da aba — o shell mapeia pro `notice` do rodapé. */
export type DadosGeraisValidacao = 'ok' | 'requiredFields' | 'cnjInvalido';

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
  imports: [ReactiveFormsModule, ComboboxComponent, CnjMaskDirective, DocumentoMaskDirective],
  templateUrl: './processo-dados-gerais.component.html',
  styleUrl: './processo-dados-gerais.component.scss',
})
export class ProcessoDadosGeraisComponent {
  private readonly processoService = inject(ProcessoService);
  private readonly statusService = inject(StatusProcessoService);
  private readonly posicaoService = inject(PosicaoClienteService);
  private readonly acaoService = inject(AcaoProcessoService);
  private readonly naturezaService = inject(NaturezaProcessoService);
  private readonly faseService = inject(FaseProcessoService);
  private readonly cidadeService = inject(CidadeService);
  private readonly destroyRef = inject(DestroyRef);

  /** Erro numa operação de catálogo (criar/renomear/excluir) — o shell mostra no rodapé. */
  readonly erro = output<string>();

  /** Rótulos legíveis do tipo (o `<app-combobox>` estático mostra o texto que recebe). */
  protected readonly tipoOpcoes = TIPOS_PROCESSO.map((t) => TIPO_PROCESSO_LABEL[t]);
  protected readonly buscarPessoas = this.processoService.buscarPessoas;
  protected readonly buscarAdvogados = this.processoService.buscarAdvogados;
  /** Picker paginado de município (`cidades`) — valor = id, rótulo = "Nome — UF". */
  protected readonly buscarCidades = this.cidadeService.buscarPagina;
  protected readonly nomesDeStatus = computed(() => this.statusService.status().map((s) => s.nome));
  protected readonly nomesDePosicao = computed(() =>
    this.posicaoService.posicoes().map((p) => p.nome),
  );
  protected readonly nomesDeAcao = computed(() => this.acaoService.acoes().map((a) => a.nome));
  protected readonly nomesDeNatureza = computed(() =>
    this.naturezaService.naturezas().map((n) => n.nome),
  );
  protected readonly nomesDeFase = computed(() => this.faseService.fases().map((f) => f.nome));

  protected readonly form: ProcessoForm = createProcessoForm();
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
  protected readonly statusNome = signal('');
  protected readonly acaoNome = signal('');
  protected readonly naturezaNome = signal('');
  protected readonly faseNome = signal('');
  /** Posição do cliente principal e da parte contrária — mesmo catálogo `PosicaoCliente`. */
  protected readonly clientePrincipalPosicaoNome = signal('');
  protected readonly contrarioPrincipalPosicaoNome = signal('');
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
  protected readonly tags = signal<string[]>([]);
  protected readonly orgaosProcessantes = signal<string[]>([]);
  protected readonly escritoriosAnteriores = signal<string[]>([]);
  // Preservados como vieram — sem UI de edição nesta fatia.
  private clientesSecundarios: ProcessoApi['clientes_secundarios'] = [];
  private partesContrarias: ProcessoApi['partes_contrarias'] = [];

  constructor() {
    this.statusService.carregar();
    this.posicaoService.carregar();
    this.acaoService.carregar();
    this.naturezaService.carregar();
    this.faseService.carregar();
    this.destroyRef.onDestroy(() => clearTimeout(this.copiadoTimer));

    this.form.controls.numeroCnj.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((v) => this.numeroValue.set(v ?? ''));
  }

  // ===================== API pro shell =====================

  /** Preenche a aba com uma ficha carregada. */
  carregar(p: ProcessoApi): void {
    patchProcessoForm(this.form, p);
    this.numeroValue.set(p.numero_cnj ?? '');
    this.tipo.set(p.tipo);
    this.statusNome.set(p.status ?? '');
    this.acaoNome.set(p.acao ?? '');
    this.naturezaNome.set(p.natureza ?? '');
    this.faseNome.set(p.fase ?? '');
    this.clientePrincipalPosicaoNome.set(p.cliente_principal_posicao ?? '');
    this.contrarioPrincipalPosicaoNome.set(p.contrario_principal_posicao ?? '');
    this.uf.set(p.uf ?? '');
    this.cidadeId.set(p.cidade_id);
    this.cidadeLabel.set(p.cidade_id !== null ? `${p.cidade ?? ''} — ${p.uf ?? ''}` : '');
    this.tags.set([...p.tags]);
    this.orgaosProcessantes.set([...p.orgaos_processantes]);
    this.escritoriosAnteriores.set([...p.escritorios_anteriores]);
    this.clientesSecundarios = p.clientes_secundarios;
    this.partesContrarias = p.partes_contrarias;

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
    this.statusNome.set('');
    this.acaoNome.set('');
    this.naturezaNome.set('');
    this.faseNome.set('');
    this.clientePrincipalPosicaoNome.set('');
    this.contrarioPrincipalPosicaoNome.set('');
    this.uf.set('');
    this.cidadeId.set(null);
    this.cidadeLabel.set('');
    this.clientePrincipalId.set(null);
    this.clientePrincipalLabel.set('');
    this.advogadoResponsavelId.set(null);
    this.advogadoResponsavelLabel.set('');
    this.tags.set([]);
    this.orgaosProcessantes.set([]);
    this.escritoriosAnteriores.set([]);
    this.clientesSecundarios = [];
    this.partesContrarias = [];
  }

  /** Valida antes de salvar; marca os campos e devolve o motivo pro shell. */
  validar(): DadosGeraisValidacao {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return 'requiredFields';
    }
    if (this.ehJudicial() && !numeroCnjCompleto(this.form.controls.numeroCnj.value)) {
      this.form.controls.numeroCnj.markAsTouched();
      return 'cnjInvalido';
    }
    return 'ok';
  }

  /** Junta FormGroup + signals no payload de escrita (sem o `id`, que é do shell). */
  coletar(): DadosGeraisValores {
    const raw = this.form.getRawValue();
    return {
      tipo: this.tipo(),
      numeroCnj: raw.numeroCnj,
      status: this.statusNome(),
      clientePrincipalId: this.clientePrincipalId(),
      clientePrincipalPosicao: this.clientePrincipalPosicaoNome(),
      contrarioPrincipalNome: raw.contrarioPrincipalNome,
      contrarioPrincipalPosicao: this.contrarioPrincipalPosicaoNome(),
      contrarioPrincipalDocumento: raw.contrarioPrincipalDocumento,
      advogadoResponsavelId: this.advogadoResponsavelId(),
      dataDistribuicao: raw.dataDistribuicao,
      acao: this.acaoNome(),
      natureza: this.naturezaNome(),
      procedimento: raw.procedimento,
      fase: this.faseNome(),
      uf: this.uf(),
      cidadeId: this.cidadeId(),
      observacoesGerais: raw.observacoesGerais,
      tags: this.tags(),
      orgaosProcessantes: this.orgaosProcessantes(),
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

  protected onAdvogadoResponsavelChange(valor: string): void {
    this.advogadoResponsavelId.set(valor ? Number(valor) : null);
    this.advogadoResponsavelLabel.set('');
  }

  protected onCidadeChange(valor: string): void {
    const id = valor ? Number(valor) : null;
    this.cidadeId.set(id);
    if (id === null) {
      this.cidadeLabel.set('');
      return;
    }
    this.cidadeService.resolver(id).subscribe((c) => {
      if (c) {
        this.cidadeLabel.set(`${c.nome} — ${c.uf}`);
        this.uf.set(c.uf);
      }
    });
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

  // --- catálogo "Status do processo" (ver `StatusProcessoService`) ---

  protected criarStatus(nome: string): void {
    this.statusService.criar(nome).subscribe({
      next: (s) => this.statusNome.set(s.nome),
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected renomearStatus({ de, para }: { de: string; para: string }): void {
    const alvo = this.statusService.status().find((s) => s.nome === de);
    if (!alvo) {
      return;
    }
    this.statusService.alterar(alvo.id, para).subscribe({
      next: (s) => {
        if (this.statusNome() === de) {
          this.statusNome.set(s.nome);
        }
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected excluirStatus(nome: string): void {
    const alvo = this.statusService.status().find((s) => s.nome === nome);
    if (!alvo) {
      return;
    }
    this.statusService.excluir(alvo.id).subscribe({
      next: () => {
        if (this.statusNome() === nome) {
          this.statusNome.set('');
        }
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  // --- catálogo "Posição do cliente" — alimenta os dois combos de posição (cliente e contrária) ---

  /** Os dois campos que apontam pro catálogo; renomear/excluir propaga pra ambos. */
  private posicoesEmUso(): WritableSignal<string>[] {
    return [this.clientePrincipalPosicaoNome, this.contrarioPrincipalPosicaoNome];
  }

  protected criarPosicao(nome: string, alvo: WritableSignal<string>): void {
    this.posicaoService.criar(nome).subscribe({
      next: (p) => alvo.set(p.nome),
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected renomearPosicao({ de, para }: { de: string; para: string }): void {
    const alvo = this.posicaoService.posicoes().find((p) => p.nome === de);
    if (!alvo) {
      return;
    }
    this.posicaoService.alterar(alvo.id, para).subscribe({
      next: (p) => {
        for (const campo of this.posicoesEmUso()) {
          if (campo() === de) {
            campo.set(p.nome);
          }
        }
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected excluirPosicao(nome: string): void {
    const alvo = this.posicaoService.posicoes().find((p) => p.nome === nome);
    if (!alvo) {
      return;
    }
    this.posicaoService.excluir(alvo.id).subscribe({
      next: () => {
        for (const campo of this.posicoesEmUso()) {
          if (campo() === nome) {
            campo.set('');
          }
        }
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  // --- catálogo "Ação" (ver `AcaoProcessoService`) ---

  protected criarAcao(nome: string): void {
    this.acaoService.criar(nome).subscribe({
      next: (a) => this.acaoNome.set(a.nome),
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected renomearAcao({ de, para }: { de: string; para: string }): void {
    const alvo = this.acaoService.acoes().find((a) => a.nome === de);
    if (!alvo) {
      return;
    }
    this.acaoService.alterar(alvo.id, para).subscribe({
      next: (a) => {
        if (this.acaoNome() === de) {
          this.acaoNome.set(a.nome);
        }
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected excluirAcao(nome: string): void {
    const alvo = this.acaoService.acoes().find((a) => a.nome === nome);
    if (!alvo) {
      return;
    }
    this.acaoService.excluir(alvo.id).subscribe({
      next: () => {
        if (this.acaoNome() === nome) {
          this.acaoNome.set('');
        }
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  // --- catálogo "Natureza" (ver `NaturezaProcessoService`) ---

  protected criarNatureza(nome: string): void {
    this.naturezaService.criar(nome).subscribe({
      next: (n) => this.naturezaNome.set(n.nome),
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected renomearNatureza({ de, para }: { de: string; para: string }): void {
    const alvo = this.naturezaService.naturezas().find((n) => n.nome === de);
    if (!alvo) {
      return;
    }
    this.naturezaService.alterar(alvo.id, para).subscribe({
      next: (n) => {
        if (this.naturezaNome() === de) {
          this.naturezaNome.set(n.nome);
        }
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected excluirNatureza(nome: string): void {
    const alvo = this.naturezaService.naturezas().find((n) => n.nome === nome);
    if (!alvo) {
      return;
    }
    this.naturezaService.excluir(alvo.id).subscribe({
      next: () => {
        if (this.naturezaNome() === nome) {
          this.naturezaNome.set('');
        }
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  // --- catálogo "Fase" (ver `FaseProcessoService`) ---

  protected criarFase(nome: string): void {
    this.faseService.criar(nome).subscribe({
      next: (f) => this.faseNome.set(f.nome),
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected renomearFase({ de, para }: { de: string; para: string }): void {
    const alvo = this.faseService.fases().find((f) => f.nome === de);
    if (!alvo) {
      return;
    }
    this.faseService.alterar(alvo.id, para).subscribe({
      next: (f) => {
        if (this.faseNome() === de) {
          this.faseNome.set(f.nome);
        }
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected excluirFase(nome: string): void {
    const alvo = this.faseService.fases().find((f) => f.nome === nome);
    if (!alvo) {
      return;
    }
    this.faseService.excluir(alvo.id).subscribe({
      next: () => {
        if (this.faseNome() === nome) {
          this.faseNome.set('');
        }
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  // --- listas de texto livre (tags / órgãos / escritórios) ---

  protected adicionarTag(valor: string): void {
    this.adicionarNaLista(this.tags, valor);
  }

  protected removerTag(indice: number): void {
    this.removerDaLista(this.tags, indice);
  }

  protected adicionarOrgao(valor: string): void {
    this.adicionarNaLista(this.orgaosProcessantes, valor);
  }

  protected removerOrgao(indice: number): void {
    this.removerDaLista(this.orgaosProcessantes, indice);
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
