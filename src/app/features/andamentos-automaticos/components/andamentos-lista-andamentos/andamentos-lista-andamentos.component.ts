import { formatDate } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Subscription, interval } from 'rxjs';

import { DATE_FORMAT } from '../../../../core/constants/app-constants';
import { ComboboxComponent } from '../../../../shared/components/combobox/combobox.component';
import { DataTableComponent } from '../../../../shared/components/table/data-table.component';
import { TableColumn } from '../../../../shared/components/table/table-column.model';
import { DatajudAndamentoApi, DatajudService } from '../../services/datajud.service';

const TODAS_AS_FONTES = 'Todas as fontes';
const TODOS_OS_TIPOS = 'Todos os tipos';

/**
 * Aba "Andamentos" do painel de Andamentos Automáticos — linha do tempo do processo no layout do
 * protótipo (Monitor de Processos): barra de filtros (pesquisa, fonte, tipo, somente novos, com
 * documento/link, limpar, contador) + tabela. Carrega pelo `processoId` (padrão das abas do
 * projeto); a consulta ao DataJud é compartilhada com a aba "Visão geral" pelo `DatajudService` —
 * os andamentos já vêm consolidados entre as capas, do mais recente pro mais antigo.
 *
 * Fonte/Tipo listam o que veio nos dados (hoje só "DataJud"/"Movimento" — crescem sozinhos quando
 * entrarem Comunica/DJEN e documentos). "Somente novos" fica desabilitado: "novo" depende de gravar
 * as consultas pra comparar com a anterior, o que ainda não existe.
 */
@Component({
  selector: 'app-andamentos-lista-andamentos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ComboboxComponent, DataTableComponent],
  templateUrl: './andamentos-lista-andamentos.component.html',
  styleUrl: './andamentos-lista-andamentos.component.scss',
})
export class AndamentosListaAndamentosComponent {
  private readonly datajudService = inject(DatajudService);
  private readonly destroyRef = inject(DestroyRef);

  /** Consulta em andamento + contador de segundos — cancelados ao trocar de processo/recarregar/destruir. */
  private consulta?: Subscription;
  private cronometro?: Subscription;

  readonly processoId = input.required<number>();

  protected readonly andamentos = signal<DatajudAndamentoApi[]>([]);
  protected readonly carregando = signal(false);
  protected readonly erro = signal('');
  /** Segundos desde o início da consulta — o DataJud chega a levar ~1 min, o contador mostra que não travou. */
  protected readonly segundosEsperando = signal(0);

  protected readonly busca = signal('');
  protected readonly fonte = signal(TODAS_AS_FONTES);
  protected readonly tipo = signal(TODOS_OS_TIPOS);
  protected readonly comDocumentoOuLink = signal(false);

  protected readonly fonteOpcoes = computed(() => [TODAS_AS_FONTES, ...this.distintos((a) => a.fonte)]);
  protected readonly tipoOpcoes = computed(() => [TODOS_OS_TIPOS, ...this.distintos((a) => a.tipo)]);

  protected readonly filtrados = computed(() => {
    const termo = this.normalizar(this.busca().trim());
    const fonte = this.fonte();
    const tipo = this.tipo();
    const comLink = this.comDocumentoOuLink();
    return this.andamentos().filter(
      (a) =>
        (fonte === TODAS_AS_FONTES || a.fonte === fonte) &&
        (tipo === TODOS_OS_TIPOS || a.tipo === tipo) &&
        (!comLink || !!a.link) &&
        (!termo || this.normalizar(this.textoPesquisavel(a)).includes(termo)),
    );
  });

  protected readonly temFiltro = computed(
    () =>
      !!this.busca().trim() ||
      this.fonte() !== TODAS_AS_FONTES ||
      this.tipo() !== TODOS_OS_TIPOS ||
      this.comDocumentoOuLink(),
  );

  protected readonly colunas: TableColumn<DatajudAndamentoApi>[] = [
    { key: 'ordem', header: 'Ord.', width: '64px', align: 'center', formatter: (v) => `${v}º` },
    {
      key: 'data_hora',
      header: 'Data/hora do ato',
      width: '140px',
      // A tabela ordena pelo texto formatado (dd/MM/yyyy ordenaria errado) — "Ord." já é a ordem cronológica.
      sortable: false,
      formatter: (v) => this.dataHora(v as string | null),
    },
    { key: 'tipo', header: 'Tipo', width: '110px' },
    { key: 'nome', header: 'Andamento / decisão / documento', formatter: (v) => (v ? String(v) : '—') },
    { key: 'fonte', header: 'Fonte', width: '100px' },
    { key: 'graus', header: 'Grau(s)', width: '80px', formatter: (v) => ((v as string[]) ?? []).join(', ') || '—' },
    { key: 'orgao_julgador', header: 'Órgão', formatter: (v) => (v ? String(v) : '—') },
    {
      key: 'data_disponibilizacao_djen',
      header: 'Disponib. DJEN',
      width: '120px',
      sortable: false,
      // `yyyy-MM-dd` puro: `new Date` leria como UTC e mostraria o dia anterior — formata direto.
      formatter: (v) => (v ? String(v).split('-').reverse().join('/') : '—'),
    },
  ];

  /** Tooltip da linha: código TPU + complementos do movimento (ex.: "tipo de conclusao: para julgamento"). */
  protected readonly tituloLinha = (a: DatajudAndamentoApi): string | null => {
    const partes = [a.codigo != null ? `TPU ${a.codigo}` : '', ...a.complementos].filter(Boolean);
    return partes.length ? partes.join(' · ') : null;
  };

  constructor() {
    effect(() => {
      const processoId = this.processoId();
      this.datajudService.versao();
      untracked(() => this.carregar(processoId));
    });
    this.destroyRef.onDestroy(() => this.cancelar());
  }

  protected onBusca(event: Event): void {
    this.busca.set((event.target as HTMLInputElement).value);
  }

  protected onComDocumentoOuLink(event: Event): void {
    this.comDocumentoOuLink.set((event.target as HTMLInputElement).checked);
  }

  protected limpar(): void {
    this.busca.set('');
    this.fonte.set(TODAS_AS_FONTES);
    this.tipo.set(TODOS_OS_TIPOS);
    this.comDocumentoOuLink.set(false);
  }

  private carregar(processoId: number): void {
    // Resposta atrasada do processo anterior não pode sobrescrever a do atual.
    this.cancelar();
    this.carregando.set(true);
    this.erro.set('');
    this.andamentos.set([]);
    this.segundosEsperando.set(0);
    this.cronometro = interval(1000).subscribe(() => this.segundosEsperando.update((s) => s + 1));
    this.consulta = this.datajudService.consultar(processoId).subscribe({
      next: (dados) => {
        this.andamentos.set(dados.andamentos);
        this.finalizar();
      },
      error: (err: unknown) => {
        this.erro.set(httpErrorMessage(err));
        this.finalizar();
      },
    });
  }

  private finalizar(): void {
    this.cronometro?.unsubscribe();
    this.carregando.set(false);
  }

  private cancelar(): void {
    this.consulta?.unsubscribe();
    this.cronometro?.unsubscribe();
  }

  private distintos(campo: (a: DatajudAndamentoApi) => string): string[] {
    return [...new Set(this.andamentos().map(campo).filter(Boolean))].sort();
  }

  private textoPesquisavel(a: DatajudAndamentoApi): string {
    return [a.nome, a.orgao_julgador, a.tipo, a.fonte, a.codigo, ...a.graus, ...a.complementos].join(' ');
  }

  /** Minúsculo e sem acento — "peticao" acha "Petição". */
  private normalizar(texto: string): string {
    return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  /** Hora 00:00 costuma ser "só a data" na origem (ex.: publicação) — aí mostra só dd/MM/yyyy, como no protótipo. */
  private dataHora(valor: string | null): string {
    if (!valor) {
      return '—';
    }
    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) {
      return valor;
    }
    const soData = data.getHours() === 0 && data.getMinutes() === 0 && data.getSeconds() === 0;
    return formatDate(data, soData ? DATE_FORMAT.SHORT : DATE_FORMAT.LONG, DATE_FORMAT.LOCALE);
  }
}

function httpErrorMessage(err: unknown): string {
  const e = err as { error?: { detail?: string; title?: string }; status?: number };
  if (e?.status === 0) {
    return 'Sem conexão com o servidor.';
  }
  return e?.error?.detail || e?.error?.title || 'Não foi possível consultar o DataJud.';
}
