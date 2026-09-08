import {
  ChangeDetectionStrategy,
  Component,
  WritableSignal,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { map, startWith } from 'rxjs';

import { maskNumeroCnj, numeroCnjCompleto } from '../../../../core/auth/documentos-br';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ComboboxComponent } from '../../../../shared/components/combobox/combobox.component';
import { PanelLayoutSwitcherComponent } from '../../../../shared/components/panel-layout-switcher/panel-layout-switcher.component';
import { CnjMaskDirective } from '../../../../shared/directives/cnj-mask.directive';
import { PAINEL_LAYOUT_PADRAO, PainelLayout } from '../../../../shared/models/panel-layout';
import {
  ProcessoApi,
  TIPO_PROCESSO_LABEL,
  TipoDocumento,
  TipoProcesso,
} from '../../services/processo-api.model';
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

type NoticeKey =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'saveError'
  | 'requiredFields'
  | 'cnjInvalido'
  | 'confirmInactivate'
  | 'statusChanged'
  | 'statusError'
  | 'panelCleared'
  | 'panelLockedSelection'
  | 'favoriteAdded'
  | 'favoriteRemoved';

interface EditorNotice {
  key: NoticeKey;
  subject?: string;
}

const TIPOS_PROCESSO: TipoProcesso[] = ['JUDICIAL', 'ADMINISTRATIVO', 'ARBITRAL'];
const TIPOS_DOCUMENTO: TipoDocumento[] = ['CPF', 'CNPJ'];

/**
 * Painel de cadastro/edição de processo (aba "Informações básicas") — dono do `FormGroup` (campos
 * de texto) + signals dos campos de combobox/listas, carrega a ficha por id (ou vazia), valida e
 * persiste via `ProcessoService`. Mesmo desenho de `advogado-form`. A página `processos` só decide
 * qual `processoId` mostrar e reage aos outputs.
 */
@Component({
  selector: 'app-processo-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    ComboboxComponent,
    PanelLayoutSwitcherComponent,
    CnjMaskDirective,
  ],
  templateUrl: './processo-form.component.html',
  styleUrl: './processo-form.component.scss',
})
export class ProcessoFormComponent {
  private readonly processoService = inject(ProcessoService);
  private readonly statusService = inject(StatusProcessoService);
  private readonly posicaoService = inject(PosicaoClienteService);
  private readonly acaoService = inject(AcaoProcessoService);
  private readonly naturezaService = inject(NaturezaProcessoService);
  private readonly faseService = inject(FaseProcessoService);
  private readonly cidadeService = inject(CidadeService);

  /** Id do registro a editar; `null` = novo cadastro. */
  readonly processoId = input<number | null>(null);
  readonly layoutPainel = input<PainelLayout>(PAINEL_LAYOUT_PADRAO);

  readonly saved = output<ProcessoApi>();
  readonly statusChanged = output<ProcessoApi>();
  readonly cleared = output<void>();
  readonly layoutPainelChange = output<PainelLayout>();

  /** Lido pela página (via `viewChild`) para travar a troca de ficha. */
  readonly locked = signal(false);

  protected readonly tiposDocumento = TIPOS_DOCUMENTO;
  /** Rótulos legíveis do tipo (o `<app-combobox>` estático mostra o texto que recebe). */
  protected readonly tipoOpcoes = TIPOS_PROCESSO.map((t) => TIPO_PROCESSO_LABEL[t]);
  protected readonly buscarPessoas = this.processoService.buscarPessoas;
  protected readonly buscarAdvogados = this.processoService.buscarAdvogados;
  /** Picker paginado de município (`cidades`) — valor = id, rótulo = "Nome — UF". */
  protected readonly buscarCidades = this.cidadeService.buscarPagina;
  /** Catálogo de status — gerido pelo `<app-combobox>` (adicionar/editar/excluir). */
  protected readonly nomesDeStatus = computed(() => this.statusService.status().map((s) => s.nome));
  /** Catálogo de posição do cliente — mesmo esquema (adicionar/editar/excluir). */
  protected readonly nomesDePosicao = computed(() =>
    this.posicaoService.posicoes().map((p) => p.nome),
  );
  /** Catálogo de ação — mesmo esquema (adicionar/editar/excluir). */
  protected readonly nomesDeAcao = computed(() => this.acaoService.acoes().map((a) => a.nome));
  /** Catálogo de natureza — mesmo esquema (adicionar/editar/excluir). */
  protected readonly nomesDeNatureza = computed(() =>
    this.naturezaService.naturezas().map((n) => n.nome),
  );
  /** Catálogo de fase — mesmo esquema (adicionar/editar/excluir). */
  protected readonly nomesDeFase = computed(() => this.faseService.fases().map((f) => f.nome));

  protected readonly form: ProcessoForm = createProcessoForm();
  private readonly numeroValue = toSignal(
    this.form.controls.numeroCnj.valueChanges.pipe(
      startWith(this.form.controls.numeroCnj.value),
      map(() => this.form.controls.numeroCnj.value),
    ),
    { requireSync: true },
  );

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
  /** Município escolhido no picker `cidades` (`null` = nenhum). Trava a UF e vira o snapshot no back. */
  protected readonly cidadeId = signal<number | null>(null);
  protected readonly cidadeLabel = signal('');
  protected readonly contrarioTipoDocumento = signal<TipoDocumento | ''>('');
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

  protected readonly entityId = signal(0);
  protected readonly favorite = signal(false);
  protected readonly ativo = signal(true);
  protected readonly pasta = signal('');
  protected readonly notice = signal<EditorNotice>({ key: 'idle' });

  protected readonly panelTitle = () => this.numeroValue().trim() || this.pasta();

  private lastLoadedKey = '';

  constructor() {
    this.statusService.carregar();
    this.posicaoService.carregar();
    this.acaoService.carregar();
    this.naturezaService.carregar();
    this.faseService.carregar();

    effect(() => {
      const id = this.processoId();
      const key = id !== null ? `id:${id}` : 'new';
      if (key === this.lastLoadedKey) {
        return;
      }
      this.lastLoadedKey = key;

      untracked(() => {
        if (id !== null) {
          this.processoService.buscarCompleto(id).subscribe((found) => {
            if (found) {
              this.loadIntoForm(found);
              this.notice.set({ key: 'idle' });
            }
          });
          return;
        }
        this.resetToEmpty();
        this.locked.set(false);
        this.notice.set({ key: 'idle' });
      });
    });
  }

  notifyLockedSelection(): void {
    this.notice.set({ key: 'panelLockedSelection' });
  }

  protected isPersisted(): boolean {
    return this.entityId() > 0;
  }

  protected isInactive(): boolean {
    return !this.ativo();
  }

  protected togglePanelLock(): void {
    this.locked.update((locked) => !locked);
  }

  protected escolherLayout(layout: PainelLayout): void {
    this.layoutPainelChange.emit(layout);
  }

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

  // --- catálogo "Status do processo": o `<app-combobox>` pede, aqui persiste (ver `StatusProcessoService`) ---

  protected criarStatus(nome: string): void {
    this.statusService.criar(nome).subscribe({
      next: (s) => this.statusNome.set(s.nome),
      error: (err: unknown) =>
        this.notice.set({ key: 'saveError', subject: this.httpErrorMessage(err) }),
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
      error: (err: unknown) =>
        this.notice.set({ key: 'saveError', subject: this.httpErrorMessage(err) }),
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
      error: (err: unknown) =>
        this.notice.set({ key: 'saveError', subject: this.httpErrorMessage(err) }),
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
      error: (err: unknown) =>
        this.notice.set({ key: 'saveError', subject: this.httpErrorMessage(err) }),
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
      error: (err: unknown) =>
        this.notice.set({ key: 'saveError', subject: this.httpErrorMessage(err) }),
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
      error: (err: unknown) =>
        this.notice.set({ key: 'saveError', subject: this.httpErrorMessage(err) }),
    });
  }

  // --- catálogo "Ação" (ver `AcaoProcessoService`) — mesmo esquema do status ---

  protected criarAcao(nome: string): void {
    this.acaoService.criar(nome).subscribe({
      next: (a) => this.acaoNome.set(a.nome),
      error: (err: unknown) =>
        this.notice.set({ key: 'saveError', subject: this.httpErrorMessage(err) }),
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
      error: (err: unknown) =>
        this.notice.set({ key: 'saveError', subject: this.httpErrorMessage(err) }),
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
      error: (err: unknown) =>
        this.notice.set({ key: 'saveError', subject: this.httpErrorMessage(err) }),
    });
  }

  // --- catálogo "Natureza" (ver `NaturezaProcessoService`) — mesmo esquema do status ---

  protected criarNatureza(nome: string): void {
    this.naturezaService.criar(nome).subscribe({
      next: (n) => this.naturezaNome.set(n.nome),
      error: (err: unknown) =>
        this.notice.set({ key: 'saveError', subject: this.httpErrorMessage(err) }),
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
      error: (err: unknown) =>
        this.notice.set({ key: 'saveError', subject: this.httpErrorMessage(err) }),
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
      error: (err: unknown) =>
        this.notice.set({ key: 'saveError', subject: this.httpErrorMessage(err) }),
    });
  }

  // --- catálogo "Fase" (ver `FaseProcessoService`) — mesmo esquema do status ---

  protected criarFase(nome: string): void {
    this.faseService.criar(nome).subscribe({
      next: (f) => this.faseNome.set(f.nome),
      error: (err: unknown) =>
        this.notice.set({ key: 'saveError', subject: this.httpErrorMessage(err) }),
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
      error: (err: unknown) =>
        this.notice.set({ key: 'saveError', subject: this.httpErrorMessage(err) }),
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
      error: (err: unknown) =>
        this.notice.set({ key: 'saveError', subject: this.httpErrorMessage(err) }),
    });
  }

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

  protected toggleFavorite(): void {
    const id = this.entityId();
    if (id > 0) {
      const desejado = this.processoService.alternarFavorito(id);
      if (desejado !== null) {
        this.favorite.set(desejado);
      }
    } else {
      this.favorite.update((value) => !value);
    }
    this.notice.set({
      key: this.favorite() ? 'favoriteAdded' : 'favoriteRemoved',
      subject: this.panelTitle(),
    });
  }

  protected save(event?: Event): void {
    event?.preventDefault();

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notice.set({ key: 'requiredFields' });
      return;
    }

    if (this.ehJudicial() && !numeroCnjCompleto(this.form.controls.numeroCnj.value)) {
      this.form.controls.numeroCnj.markAsTouched();
      this.notice.set({ key: 'cnjInvalido' });
      return;
    }

    const raw = this.form.getRawValue();
    const payload: ProcessoEditavel = {
      id: this.entityId(),
      tipo: this.tipo(),
      numeroCnj: raw.numeroCnj,
      status: this.statusNome(),
      clientePrincipalId: this.clientePrincipalId(),
      clientePrincipalPosicao: this.clientePrincipalPosicaoNome(),
      contrarioPrincipalNome: raw.contrarioPrincipalNome,
      contrarioPrincipalPosicao: this.contrarioPrincipalPosicaoNome(),
      contrarioPrincipalDocumento: raw.contrarioPrincipalDocumento,
      contrarioPrincipalTipoDocumento: this.contrarioTipoDocumento(),
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

    this.notice.set({ key: 'saving' });
    this.processoService.salvar(payload).subscribe({
      next: (salvo) => {
        this.loadIntoForm(salvo);
        this.lastLoadedKey = `id:${salvo.id}`;
        this.notice.set({ key: 'saved', subject: this.rotuloDe(salvo) });
        this.saved.emit(salvo);
      },
      error: (err: unknown) => {
        this.notice.set({ key: 'saveError', subject: this.httpErrorMessage(err) });
      },
    });
  }

  protected requestStatusChange(): void {
    if (this.isInactive()) {
      this.applyStatusChange(true);
      return;
    }
    this.notice.set({ key: 'confirmInactivate', subject: this.panelTitle() });
  }

  protected confirmInactivate(): void {
    this.applyStatusChange(false);
  }

  private applyStatusChange(ativo: boolean): void {
    this.processoService.alterarStatus(this.entityId(), ativo).subscribe({
      next: (updated) => {
        this.loadIntoForm(updated);
        this.notice.set({ key: 'statusChanged', subject: ativo ? 'ativado' : 'inativado' });
        this.statusChanged.emit(updated);
      },
      error: (err: unknown) => {
        this.notice.set({ key: 'statusError', subject: this.httpErrorMessage(err) });
      },
    });
  }

  protected clearPanel(): void {
    this.resetToEmpty();
    this.lastLoadedKey = 'new';
    this.locked.set(false);
    this.notice.set({ key: 'panelCleared' });
    this.cleared.emit();
  }

  private resetToEmpty(): void {
    this.form.reset();
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
    this.contrarioTipoDocumento.set('');
    this.clientePrincipalId.set(null);
    this.clientePrincipalLabel.set('');
    this.advogadoResponsavelId.set(null);
    this.advogadoResponsavelLabel.set('');
    this.tags.set([]);
    this.orgaosProcessantes.set([]);
    this.escritoriosAnteriores.set([]);
    this.clientesSecundarios = [];
    this.partesContrarias = [];
    this.entityId.set(0);
    this.favorite.set(false);
    this.ativo.set(true);
    this.pasta.set('');
  }

  private loadIntoForm(p: ProcessoApi): void {
    this.entityId.set(p.id);
    this.favorite.set(p.favorito);
    this.ativo.set(p.ativo);
    this.pasta.set(p.pasta ?? '');
    patchProcessoForm(this.form, p);
    this.tipo.set(p.tipo);
    this.statusNome.set(p.status ?? '');
    this.acaoNome.set(p.acao ?? '');
    this.naturezaNome.set(p.natureza ?? '');
    this.faseNome.set(p.fase ?? '');
    this.clientePrincipalPosicaoNome.set(p.cliente_principal_posicao ?? '');
    this.contrarioPrincipalPosicaoNome.set(p.contrario_principal_posicao ?? '');
    this.uf.set(p.uf ?? '');
    this.cidadeId.set(p.cidade_id);
    this.cidadeLabel.set(
      p.cidade_id !== null ? `${p.cidade ?? ''} — ${p.uf ?? ''}` : '',
    );
    this.contrarioTipoDocumento.set(p.contrario_principal_tipo_documento ?? '');
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

  private rotuloDe(p: ProcessoApi): string {
    return p.numero_cnj?.trim() || p.pasta || `#${p.id}`;
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
