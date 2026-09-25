import { formatDate } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Subscription, interval } from 'rxjs';

import { DATE_FORMAT } from '../../../../core/constants/app-constants';
import { DateFormatPipe } from '../../../../shared/pipes/date-format.pipe';
import { DatajudService, DatajudVisaoGeralApi, STATUS_DATAJUD_LABEL } from '../../services/datajud.service';

interface CampoVisaoGeral {
  label: string;
  valor: string;
  /** Texto longo (ex.: assuntos) — corta com reticências e mostra inteiro no `title`. */
  truncar?: boolean;
}

/**
 * Aba "Visão geral" do painel de Andamentos Automáticos — o que o DataJud diz do processo
 * (capa de referência), no layout de duas colunas "rótulo: valor" do protótipo (Monitor de
 * Processos). Consulta o DataJud na hora a cada processo selecionado e no botão "Atualizar";
 * nada é gravado ainda.
 *
 * Referência, Status Comunica/DJEN, Status/Identificação STF e Ativo no monitoramento estão no
 * protótipo mas ainda não têm fonte — aparecem com "—"/"Não integrado" até existirem.
 */
@Component({
  selector: 'app-andamentos-visao-geral',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DateFormatPipe],
  templateUrl: './andamentos-visao-geral.component.html',
  styleUrl: './andamentos-visao-geral.component.scss',
})
export class AndamentosVisaoGeralComponent {
  private readonly datajudService = inject(DatajudService);
  private readonly destroyRef = inject(DestroyRef);

  /** Consulta em andamento + contador de segundos — cancelados ao trocar de processo/atualizar/destruir. */
  private consulta?: Subscription;
  private cronometro?: Subscription;

  readonly processoId = input.required<number>();
  readonly numeroCnj = input<string | null>(null);
  readonly clienteNome = input<string | null>(null);

  protected readonly carregando = signal(false);
  protected readonly erro = signal('');
  protected readonly visao = signal<DatajudVisaoGeralApi | null>(null);
  /** Segundos desde o início da consulta — o DataJud chega a levar ~1 min, o contador mostra que não travou. */
  protected readonly segundosEsperando = signal(0);

  protected readonly campos = computed<CampoVisaoGeral[]>(() => {
    const v = this.visao();
    const encontrado = v !== null && v.status !== 'NAO_ENCONTRADO';
    return [
      { label: 'Processo', valor: this.numeroCnj() || v?.numero_cnj || '—' },
      { label: 'Cliente', valor: this.clienteNome() || '—' },
      { label: 'Tribunal', valor: v?.tribunal ?? '—' },
      { label: 'Referência', valor: '—' },
      { label: 'Grau de referência', valor: v?.grau ?? '—' },
      { label: 'Classe de referência', valor: v?.classe ?? '—' },
      { label: 'Órgão julgador de referência', valor: v?.orgao_julgador ?? '—' },
      { label: 'Ajuizamento', valor: this.data(v?.data_ajuizamento, DATE_FORMAT.SHORT) },
      { label: 'Sistema', valor: v?.sistema ?? '—' },
      { label: 'Formato', valor: v?.formato ?? '—' },
      { label: 'Assuntos da capa', valor: v?.assuntos.length ? v.assuntos.join(' | ') : '—', truncar: true },
      { label: 'Nível de sigilo', valor: encontrado && v?.nivel_sigilo != null ? String(v.nivel_sigilo) : '—' },
      { label: 'Última atualização DataJud', valor: this.data(v?.data_ultima_atualizacao, DATE_FORMAT.LONG) },
      { label: 'Status DataJud', valor: this.statusDatajud() },
      { label: 'Status Comunica/DJEN', valor: 'Não integrado' },
      { label: 'Status STF', valor: 'Não integrado' },
      { label: 'Identificação STF', valor: '—' },
      { label: 'Ativo no monitoramento', valor: '—' },
    ];
  });

  /**
   * Caixa "Diagnóstico das fontes" abaixo do Conteúdo armazenado — resumo em texto, no formato do
   * protótipo (Monitor de Processos). Comunica/DJEN e STF ainda não integrados.
   */
  protected readonly diagnostico = computed<string[]>(() => {
    if (this.carregando()) {
      return ['Consultando o DataJud...'];
    }
    const v = this.visao();
    const erro = this.erro();
    const linhas: string[] = [];

    linhas.push(`DataJud: ${erro ? 'Erro' : this.statusDatajud()}`);
    if (v) {
      linhas.push(`Tribunais consultados: ${v.tribunais_consultados.join(', ') || 'nenhum índice público'}`);
      if (v.tribunais_com_falha.length) {
        linhas.push(`Tribunais com falha: ${v.tribunais_com_falha.join(', ')}`);
      }
      linhas.push(`Capas DataJud encontradas: ${v.total_capas}`);
      const ultimo = v.ultimo_movimento;
      linhas.push(
        `Último movimento DataJud exibido: ${
          ultimo ? `${this.data(ultimo.data_hora, DATE_FORMAT.LONG)} — ${ultimo.nome ?? 'sem descrição'}` : '—'
        }`,
      );
    }
    linhas.push('Comunica/DJEN: Não integrado');
    linhas.push('Publicações Comunica/DJEN/STF armazenadas: 0');
    linhas.push('STF: Não integrado');
    if (v) {
      linhas.push(
        `Linha do tempo consolidada: DataJud, com ${v.total_andamentos} andamento(s) e 0 publicação(ões) armazenada(s).`,
      );
      linhas.push('As datas processuais são exibidas como informadas pela fonte.');
      linhas.push(`Última consulta DataJud: ${this.data(v.consultado_em, DATE_FORMAT.LONG)}`);
    }
    if (erro) {
      linhas.push('', `Erro DataJud:`, erro);
    }
    return linhas;
  });

  constructor() {
    effect(() => {
      const processoId = this.processoId();
      untracked(() => this.carregar(processoId));
    });
    this.destroyRef.onDestroy(() => this.cancelar());
  }

  protected atualizar(): void {
    this.carregar(this.processoId());
  }

  private carregar(processoId: number): void {
    // Resposta atrasada do processo anterior não pode sobrescrever a do atual.
    this.cancelar();
    this.carregando.set(true);
    this.erro.set('');
    this.visao.set(null);
    this.segundosEsperando.set(0);
    this.cronometro = interval(1000).subscribe(() => this.segundosEsperando.update((s) => s + 1));
    this.consulta = this.datajudService.visaoGeral(processoId).subscribe({
      next: (visao) => {
        this.visao.set(visao);
        this.finalizar();
      },
      error: (err: unknown) => {
        this.erro.set(this.httpErrorMessage(err));
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

  private statusDatajud(): string {
    if (this.carregando()) {
      return 'Consultando...';
    }
    if (this.erro()) {
      return 'Erro';
    }
    const v = this.visao();
    if (!v) {
      return '—';
    }
    const label = STATUS_DATAJUD_LABEL[v.status];
    return v.tribunais_com_falha.length ? `${label} — falhou: ${v.tribunais_com_falha.join(', ')}` : label;
  }

  private data(valor: string | null | undefined, formato: string): string {
    if (!valor) {
      return '—';
    }
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? valor : formatDate(data, formato, DATE_FORMAT.LOCALE);
  }

  private httpErrorMessage(err: unknown): string {
    const e = err as { error?: { detail?: string; title?: string }; message?: string; status?: number };
    if (e?.status === 0) {
      return 'Sem conexão com o servidor.';
    }
    return e?.error?.detail || e?.error?.title || 'Não foi possível consultar o DataJud.';
  }
}
