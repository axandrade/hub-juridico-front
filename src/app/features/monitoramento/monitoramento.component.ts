import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Subscription, debounceTime, distinctUntilChanged, switchMap, timer } from 'rxjs';

import { PanelShellController } from '../../shared/panel-shell/panel-shell.controller';
import { ButtonComponent } from '../../shared/components/button/button.component';
import { ColumnsMenuComponent } from '../../shared/components/columns-menu/columns-menu.component';
import { DomainModelTableComponent } from '../../shared/components/domain-table/domain-model-table.component';
import { ModalComponent } from '../../shared/components/modal/modal.component';
import { BadgeTone } from '../../shared/components/badge/badge.component';
import { TableColumn } from '../../shared/components/table/table-column.model';
import { ToastService } from '../../shared/services/toast.service';
import { AndamentosAutomaticosProcessoPanelComponent } from '../andamentos-automaticos/components/andamentos-automaticos-processo-panel/andamentos-automaticos-processo-panel.component';
import { MonitoramentoCadastrarProcessoComponent } from './components/monitoramento-cadastrar-processo/monitoramento-cadastrar-processo.component';
import { MonitoramentoFormComponent } from './components/monitoramento-form/monitoramento-form.component';
import {
  MonitoramentoProcessoFormComponent,
  ProcessoSalvo,
} from './components/monitoramento-processo-form/monitoramento-processo-form.component';
import {
  AtualizacaoApi,
  MonitoramentoProcessoRow,
  MonitoramentoResumoRow,
  MonitoramentoService,
  SituacaoProcesso,
} from './services/monitoramento.service';

type FiltroSituacao = 'todos' | 'novidades' | SituacaoProcesso;

interface Chip {
  id: FiltroSituacao;
  rotulo: string;
  total: number;
}

const INTERVALO_POLLING_MS = 2000;
const CHAVE_LISTA_RECOLHIDA = 'hub-juridico.monitoramento.listaRecolhida';

const FONTES: { campo: 'datajud' | 'stf' | 'comunica'; rotulo: string }[] = [
  { campo: 'datajud', rotulo: 'DataJud' },
  { campo: 'stf', rotulo: 'STF' },
  { campo: 'comunica', rotulo: 'DJEN' },
];

/** Tira aspas simples — o RQL do ddd-noap delimita valor com elas e não tem escape. */
function termoRql(texto: string): string {
  return texto.trim().replace(/'/g, '');
}

/**
 * Tela de Monitoramento: pacotes ("monitoramentos") de processos acompanhados pelas fontes do
 * Andamentos Automáticos (DataJud, STF, Comunica/DJEN) — em geral processos fora do cadastro.
 *
 * À esquerda, a lista de monitoramentos (`app-domain-model-table` sobre a view
 * `monitoramento-resumo`, paginada no servidor). À direita, o monitoramento selecionado: filtros
 * por situação da última consulta, a tabela dos processos dele (`monitoramento-processo-resumo`) e
 * o painel do Andamentos Automáticos do processo clicado — o mesmo componente da tela de Andamentos,
 * que consulta pelo número CNJ. Painel posicionável (`PanelShellController`), igual Processos.
 *
 * "Atualizar" consulta todos os números em segundo plano no backend (o DataJud chega a ~1 min por
 * número); a tela acompanha por polling, recarregando a tabela a cada número concluído. Novidades
 * são por usuário e não cabem nas views: vêm do `MonitoramentoService` do backend
 * (`/domain/service`) e entram como coluna, casadas pelo `id` da linha.
 *
 * "Com novidades" filtra pelas linhas com novidade (`id eq ... or ...`). O RQL do
 * ddd-noap não tem parênteses nem `in` e avalia da esquerda pra direita — somar a busca livre
 * (outra sequência de `or`) misturaria as duas, então nesse filtro a busca fica desligada.
 */
@Component({
  selector: 'app-monitoramento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DomainModelTableComponent,
    ColumnsMenuComponent,
    ButtonComponent,
    ModalComponent,
    AndamentosAutomaticosProcessoPanelComponent,
    MonitoramentoFormComponent,
    MonitoramentoProcessoFormComponent,
    MonitoramentoCadastrarProcessoComponent,
  ],
  templateUrl: './monitoramento.component.html',
  styleUrl: './monitoramento.component.scss',
})
export class MonitoramentoComponent {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly service = inject(MonitoramentoService);
  private readonly toast = inject(ToastService);

  protected readonly panelShell = new PanelShellController(this.document, {
    storagePrefix: 'hub-juridico.monitoramento',
    larguraPadrao: 620,
    larguraMin: 420,
    larguraMax: 1000,
  });

  protected readonly gradeMonitoramentos = viewChild<DomainModelTableComponent<MonitoramentoResumoRow>>('gradeMonitoramentos');
  protected readonly gradeProcessos = viewChild<DomainModelTableComponent<MonitoramentoProcessoRow>>('gradeProcessos');

  // ------------------------------------------------------------------ monitoramentos
  protected readonly buscaMonitoramento = signal('');
  protected readonly incluirInativos = signal(false);
  private readonly buscaMonitoramentoDebounced = toSignal(
    toObservable(this.buscaMonitoramento).pipe(debounceTime(300), distinctUntilChanged()),
    { initialValue: '' },
  );
  protected readonly filtroMonitoramentos = computed(() => {
    const termo = termoRql(this.buscaMonitoramentoDebounced());
    const clausulas = [termo ? `nome ilike '*${termo}*'` : '', this.incluirInativos() ? '' : 'ativo eq true'];
    return clausulas.filter(Boolean).join(' and ');
  });

  protected readonly monitoramento = signal<MonitoramentoResumoRow | null>(null);
  /** Novidades não vistas por monitoramento (`{id: total}`). */
  private readonly novidadesMonitoramentos = signal<Record<number, number>>({});

  protected readonly colunasMonitoramentos: TableColumn<MonitoramentoResumoRow>[] = [
    { key: 'nome', header: 'Nome' },
    { key: 'totalProcessos', header: 'Proc.', width: '64px', align: 'right' },
    {
      key: 'novidades',
      header: 'Novas',
      width: '84px',
      sortable: false,
      format: 'badge',
      badgeTone: () => 'danger',
      formatter: (_, row) => this.rotuloNovidades(this.novidadesMonitoramentos()[row.id] ?? 0),
    },
  ];

  protected readonly classeMonitoramento = (row: MonitoramentoResumoRow): Record<string, boolean> => ({
    'is-selected': this.monitoramento()?.id === row.id,
    'is-inactive': !row.ativo,
  });

  /** Lista de monitoramentos recolhida numa faixa fina — dá espaço pra tabela + painel. Lembrada no navegador. */
  protected readonly listaRecolhida = signal(this.lerListaRecolhida());

  // ------------------------------------------------------------------ processos do monitoramento
  protected readonly filtroSituacao = signal<FiltroSituacao>('todos');
  protected readonly buscaProcesso = signal('');
  private readonly buscaProcessoDebounced = toSignal(
    toObservable(this.buscaProcesso).pipe(debounceTime(300), distinctUntilChanged()),
    { initialValue: '' },
  );
  /** Novidades não vistas por processo (id da linha) do monitoramento selecionado. */
  private readonly novidadesProcessos = signal<Record<number, number>>({});

  protected readonly processo = signal<MonitoramentoProcessoRow | null>(null);

  protected readonly filtroProcessos = computed(() => {
    const m = this.monitoramento();
    if (!m) {
      return 'id eq 0';
    }
    const doMonitoramento = `monitoramentoId eq ${m.id}`;
    const situacao = this.filtroSituacao();
    if (situacao === 'novidades') {
      const ids = Object.keys(this.novidadesProcessos());
      if (!ids.length) {
        return 'id eq 0';
      }
      return [ids.map((id) => `id eq ${id}`).join(' or '), doMonitoramento].join(' and ');
    }
    const termo = termoRql(this.buscaProcessoDebounced());
    const busca = termo
      ? ['numeroCnj', 'cliente', 'contrario', 'acao'].map((campo) => `${campo} ilike '*${termo}*'`).join(' or ')
      : '';
    const porSituacao = situacao === 'todos' ? '' : `situacao eq '${situacao}'`;
    return [busca, doMonitoramento, porSituacao].filter(Boolean).join(' and ');
  });

  protected readonly chips = computed<Chip[]>(() => {
    const m = this.monitoramento();
    if (!m) {
      return [];
    }
    const todos: Chip[] = [
      { id: 'todos', rotulo: 'Todos', total: m.totalProcessos },
      { id: 'novidades', rotulo: 'Com novidades', total: Object.keys(this.novidadesProcessos()).length },
      { id: 'ENCONTRADO', rotulo: 'Encontrados', total: m.totalEncontrados },
      { id: 'NAO_ENCONTRADO', rotulo: 'Não encontrados', total: m.totalNaoEncontrados },
      { id: 'COM_FALHA', rotulo: 'Com falha', total: m.totalComFalha },
      { id: 'NAO_CONSULTADO', rotulo: 'Não consultados', total: m.totalNaoConsultados },
      { id: 'NUMERO_INVALIDO', rotulo: 'Número inválido', total: m.totalNumeroInvalido },
    ];
    return todos.filter((c) => c.id === 'todos' || c.total > 0 || c.id === this.filtroSituacao());
  });

  protected readonly colunasProcessos: TableColumn<MonitoramentoProcessoRow>[] = [
    { key: 'numeroCnj', header: 'Número CNJ', width: '200px' },
    { key: 'cliente', header: 'Cliente' },
    { key: 'contrario', header: 'Contrário', formatter: (v) => (v ? String(v) : '—') },
    { key: 'acao', header: 'Ação', width: '170px', formatter: (v) => (v ? String(v) : '—') },
    {
      key: 'status',
      header: 'Status',
      width: '110px',
      format: 'badge',
      formatter: (v) => (v ? String(v) : '—'),
      badgeTone: (v) => this.tomStatus(v as string | null),
    },
    {
      key: 'situacao',
      header: 'Encontrado em',
      width: '190px',
      format: 'badge',
      formatter: (_, row) => this.rotuloFontes(row),
      badgeTone: (_, row) => this.tomFontes(row),
    },
    { key: 'ultimoMovimento', header: 'Último movimento', formatter: (v) => (v ? String(v) : '—') },
    { key: 'ultimoMovimentoEm', header: 'Data', width: '110px', format: 'date' },
    {
      key: 'novidades',
      header: 'Novidades',
      width: '104px',
      sortable: false,
      format: 'badge',
      badgeTone: () => 'danger',
      formatter: (_, row) => this.rotuloNovidades(this.novidadesProcessos()[row.id] ?? 0),
    },
    { key: 'processoPasta', header: 'No sistema', width: '120px', formatter: (v) => (v ? String(v) : '—') },
    { key: 'tribunal', header: 'Tribunal', width: '100px', formatter: (v) => (v ? String(v) : '—') },
    { key: 'consultadoEm', header: 'Consultado em', width: '130px', format: 'date' },
  ];
  protected readonly colunasPadraoProcessos = [
    'numeroCnj',
    'cliente',
    'contrario',
    'acao',
    'status',
    'situacao',
    'ultimoMovimento',
    'ultimoMovimentoEm',
    'novidades',
    'processoPasta',
  ];
  protected readonly camposProcessos =
    'id,monitoramentoId,numeroCnj,numeroCnjDigitos,cliente,contrario,acaoId,acao,statusId,status,observacao,' +
    'datajud,stf,comunica,tribunal,ultimoMovimentoEm,ultimoMovimento,consultadoEm,numeroValido,situacao,processoId,processoPasta';

  protected readonly classeProcesso = (row: MonitoramentoProcessoRow): Record<string, boolean> => ({
    'is-selected': this.processo()?.id === row.id,
    'tem-novidade': (this.novidadesProcessos()[row.id] ?? 0) > 0,
  });
  protected readonly tituloProcesso = (row: MonitoramentoProcessoRow): string | null => row.observacao;

  protected readonly editarProcessoAcao = (row: MonitoramentoProcessoRow): void => this.processoEmEdicao.set(row);
  protected readonly removerProcessoAcao = (row: MonitoramentoProcessoRow): void => this.aRemover.set(row);

  // ------------------------------------------------------------------ diálogos
  /** `null` fechado; `'novo'` criando; linha editando. */
  protected readonly monitoramentoEmEdicao = signal<MonitoramentoResumoRow | 'novo' | null>(null);
  /** `null` fechado; `'novo'` adicionando; linha editando. */
  protected readonly processoEmEdicao = signal<MonitoramentoProcessoRow | 'novo' | null>(null);
  protected readonly aRemover = signal<MonitoramentoProcessoRow | null>(null);
  /** Processo do monitoramento sendo cadastrado no sistema ("Cadastrar no sistema"). */
  protected readonly aCadastrar = signal<MonitoramentoProcessoRow | null>(null);

  protected readonly editarMonitoramentoAcao = (row: MonitoramentoResumoRow): void => this.monitoramentoEmEdicao.set(row);

  // ------------------------------------------------------------------ atualização
  protected readonly atualizacao = signal<AtualizacaoApi | null>(null);
  protected readonly atualizando = computed(() => this.atualizacao()?.em_andamento ?? false);
  protected readonly progresso = computed(() => {
    const a = this.atualizacao();
    return a && a.total ? Math.round((a.concluidos / a.total) * 100) : 0;
  });
  private polling: Subscription | null = null;

  constructor() {
    this.carregarNovidadesMonitoramentos();
    this.destroyRef.onDestroy(() => this.pararPolling());
  }

  // ------------------------------------------------------------------ monitoramentos
  protected alternarLista(): void {
    this.listaRecolhida.update((v) => !v);
    try {
      this.document.defaultView?.localStorage.setItem(CHAVE_LISTA_RECOLHIDA, String(this.listaRecolhida()));
    } catch {
      // Sem storage (modo privado etc.): vale só nesta visita.
    }
  }

  private lerListaRecolhida(): boolean {
    try {
      return this.document.defaultView?.localStorage.getItem(CHAVE_LISTA_RECOLHIDA) === 'true';
    } catch {
      return false;
    }
  }

  protected onBuscaMonitoramento(event: Event): void {
    this.buscaMonitoramento.set((event.target as HTMLInputElement).value);
  }

  /** Primeira carga: abre o primeiro monitoramento da lista, pra tela não começar vazia. */
  protected onMonitoramentosCarregados(linhas: MonitoramentoResumoRow[]): void {
    const atual = this.monitoramento();
    if (atual) {
      const atualizada = linhas.find((l) => l.id === atual.id);
      if (atualizada) {
        this.monitoramento.set(atualizada);
      }
      return;
    }
    if (linhas.length) {
      this.selecionarMonitoramento(linhas[0]);
    }
  }

  protected selecionarMonitoramento(row: MonitoramentoResumoRow): void {
    if (this.monitoramento()?.id === row.id) {
      return;
    }
    this.pararPolling();
    this.atualizacao.set(null);
    this.monitoramento.set(row);
    this.processo.set(null);
    this.filtroSituacao.set('todos');
    this.buscaProcesso.set('');
    this.carregarNovidadesProcessos();
    // Retoma o acompanhamento se já havia uma atualização rodando (outra aba, outro usuário).
    this.service.situacaoAtualizacao(row.id).subscribe({
      next: (a) => {
        if (a && this.monitoramento()?.id === row.id) {
          this.atualizacao.set(a);
          if (a.em_andamento) {
            this.acompanhar(row.id);
          }
        }
      },
    });
  }

  protected onMonitoramentoSalvo(id: number): void {
    this.gradeMonitoramentos()?.reload();
    this.service.buscarResumo(id).subscribe({
      next: (m) => {
        if (this.monitoramento()?.id === id) {
          this.monitoramento.set(m);
        } else {
          this.selecionarMonitoramento(m);
        }
      },
    });
  }

  // ------------------------------------------------------------------ processos
  protected escolherSituacao(id: FiltroSituacao): void {
    this.filtroSituacao.set(id);
  }

  protected onBuscaProcesso(event: Event): void {
    this.buscaProcesso.set((event.target as HTMLInputElement).value);
  }

  protected selecionarProcesso(row: MonitoramentoProcessoRow): void {
    this.processo.set(row);
    this.panelShell.setPanelVisible(true);
  }

  protected fecharPainel(): void {
    this.processo.set(null);
    // O painel pode ter marcado novidades como vistas ou atualizado o número.
    this.recarregarMonitoramento();
  }

  protected onProcessoSalvo(salvo: ProcessoSalvo): void {
    this.recarregarMonitoramento();
    if (salvo.consultarFontes) {
      this.service.consultarFontes(salvo.numeroCnj).subscribe({
        next: () => this.recarregarMonitoramento(),
        error: () => this.toast.erro(`Não foi possível consultar as fontes de ${salvo.numeroCnj} agora.`),
      });
    }
  }

  /** Depois do "Cadastrar no sistema": a linha aberta passa a mostrar o vínculo (`processoPasta`). */
  protected onCadastradoNoSistema(): void {
    const aberto = this.processo();
    this.recarregarMonitoramento();
    if (!aberto) {
      return;
    }
    this.service.buscarProcessoResumo(aberto.id).subscribe({
      next: (linha) => {
        if (this.processo()?.id === linha.id) {
          this.processo.set(linha);
        }
      },
    });
  }

  protected confirmarRemocao(): void {
    const row = this.aRemover();
    if (!row) {
      return;
    }
    this.service.removerProcesso(row.id).subscribe({
      next: () => {
        this.aRemover.set(null);
        if (this.processo()?.id === row.id) {
          this.processo.set(null);
        }
        this.toast.sucesso(`${row.numeroCnj} saiu do monitoramento.`);
        this.recarregarMonitoramento();
      },
      error: () => this.toast.erro('Não foi possível remover o processo.'),
    });
  }

  // ------------------------------------------------------------------ atualização
  protected atualizar(): void {
    const m = this.monitoramento();
    if (!m || this.atualizando()) {
      return;
    }
    this.service.iniciarAtualizacao(m.id).subscribe({
      next: (a) => {
        this.atualizacao.set(a);
        this.acompanhar(m.id);
      },
      error: () => this.toast.erro('Não foi possível iniciar a atualização.'),
    });
  }

  protected cancelarAtualizacao(): void {
    const m = this.monitoramento();
    if (m) {
      this.service.cancelarAtualizacao(m.id).subscribe();
    }
  }

  /** Polling até terminar; cada número concluído recarrega a tabela (as linhas "acendem" uma a uma). */
  private acompanhar(monitoramentoId: number): void {
    this.pararPolling();
    let concluidos = this.atualizacao()?.concluidos ?? 0;
    this.polling = timer(INTERVALO_POLLING_MS, INTERVALO_POLLING_MS)
      .pipe(
        switchMap(() => this.service.situacaoAtualizacao(monitoramentoId)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (a) => {
          if (!a || this.monitoramento()?.id !== monitoramentoId) {
            this.pararPolling();
            return;
          }
          this.atualizacao.set(a);
          if (a.concluidos !== concluidos) {
            concluidos = a.concluidos;
            this.gradeProcessos()?.reload();
          }
          if (!a.em_andamento) {
            this.pararPolling();
            this.recarregarMonitoramento();
            this.avisarFim(a);
          }
        },
        error: () => this.pararPolling(),
      });
  }

  private avisarFim(a: AtualizacaoApi): void {
    if (a.cancelada) {
      this.toast.info(`Atualização cancelada: ${a.concluidos} de ${a.total} processo(s) consultados.`);
    } else if (a.falhas) {
      this.toast.erro(`Atualização concluída com ${a.falhas} falha(s) em ${a.total} processo(s).`);
    } else {
      this.toast.sucesso(`Atualização concluída: ${a.total} processo(s) consultados.`);
    }
  }

  private pararPolling(): void {
    this.polling?.unsubscribe();
    this.polling = null;
  }

  // ------------------------------------------------------------------ recargas
  /** Depois de qualquer mudança: tabela de processos, contagens do monitoramento e novidades. */
  private recarregarMonitoramento(): void {
    const m = this.monitoramento();
    this.gradeProcessos()?.reload();
    this.gradeMonitoramentos()?.reload();
    this.carregarNovidadesProcessos();
    this.carregarNovidadesMonitoramentos();
    if (m) {
      this.service.buscarResumo(m.id).subscribe({
        next: (atual) => {
          if (this.monitoramento()?.id === atual.id) {
            this.monitoramento.set(atual);
          }
        },
      });
    }
  }

  private carregarNovidadesMonitoramentos(): void {
    this.service.novidadesPorMonitoramento().subscribe({
      next: (mapa) => this.novidadesMonitoramentos.set(mapa),
    });
  }

  private carregarNovidadesProcessos(): void {
    const m = this.monitoramento();
    if (!m) {
      this.novidadesProcessos.set({});
      return;
    }
    this.service.novidadesDoMonitoramento(m.id).subscribe({
      next: (mapa) => {
        if (this.monitoramento()?.id === m.id) {
          this.novidadesProcessos.set(mapa);
        }
      },
    });
  }

  // ------------------------------------------------------------------ apresentação
  protected ultimaAtualizacao(m: MonitoramentoResumoRow): string {
    if (!m.ultimaAtualizacaoEm) {
      return 'nunca atualizado';
    }
    const data = new Date(m.ultimaAtualizacaoEm);
    return `atualizado em ${data.toLocaleDateString('pt-BR')} às ${data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  }

  private rotuloNovidades(total: number): string {
    return total ? `${total} ${total === 1 ? 'nova' : 'novas'}` : '';
  }

  private rotuloFontes(row: MonitoramentoProcessoRow): string {
    if (row.situacao === 'NUMERO_INVALIDO') {
      return 'Número inválido';
    }
    if (row.situacao === 'NAO_CONSULTADO') {
      return 'Não consultado';
    }
    const achadas = FONTES.filter((f) => row[f.campo] === 'ENCONTRADO' || row[f.campo] === 'FALHOU').map(
      (f) => f.rotulo + (row[f.campo] === 'FALHOU' ? ' (falhou)' : ''),
    );
    return achadas.length ? achadas.join(' · ') : 'Não encontrado';
  }

  private tomFontes(row: MonitoramentoProcessoRow): BadgeTone {
    const tons: Record<SituacaoProcesso, BadgeTone> = {
      NUMERO_INVALIDO: 'danger',
      NAO_CONSULTADO: 'neutral',
      NAO_ENCONTRADO: 'neutral',
      COM_FALHA: 'warning',
      ENCONTRADO: 'success',
    };
    return tons[row.situacao];
  }

  private tomStatus(status: string | null): BadgeTone {
    const s = (status ?? '').toLowerCase();
    if (s === 'ativo') {
      return 'success';
    }
    if (s === 'suspenso') {
      return 'warning';
    }
    return 'neutral';
  }

  protected togglePanel(): void {
    this.panelShell.togglePanel();
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.panelShell.layoutPainel() === 'dialog' && this.panelShell.panelVisible()) {
      this.panelShell.fecharDialog();
    }
  }
}
