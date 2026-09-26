import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Subscription, interval } from 'rxjs';

import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { DataTableComponent } from '../../../../shared/components/table/data-table.component';
import { TableColumn } from '../../../../shared/components/table/table-column.model';
import { TableRowAction } from '../../../../shared/components/table/table.model';
import { ToastService } from '../../../../shared/services/toast.service';
import { AndamentosService, PublicacaoApi } from '../../services/andamentos.service';

/**
 * Aba "Publicações" do painel de Andamentos Automáticos — publicações do processo no DJEN
 * (Comunica PJe) e no DJe do STF, numa lista só (coluna Fonte), no layout do protótipo (Monitor de
 * Processos): tabela + detalhe da publicação selecionada embaixo, com "Copiar texto", "Abrir
 * certidão" e "Abrir publicação". Carrega pelo `processoId` (padrão das abas do projeto), mas a
 * resposta é a mesma das abas "Visão geral" e "Andamentos" (`AndamentosService`, cada fonte
 * consultada uma vez) — por isso espera o DataJud e recarrega junto no "Atualizar". Falha no
 * Comunica ou no STF não vira erro: a lista sai com a outra fonte e um aviso diz o que ficou de fora.
 *
 * Novidades (publicação que apareceu num "Atualizar" e o usuário ainda não viu) ficam em negrito
 * (`is-novo`) até ele usar "Marcar como vista" na última coluna (pede confirmação) ou "Marcar
 * todos como vistos" — selecionar a linha só mostra o detalhe. Mesmo estado da
 * aba Andamentos (`AndamentosService`): a publicação do DJEN vista aqui sai do negrito lá também.
 */
@Component({
  selector: 'app-andamentos-lista-publicacoes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, DataTableComponent, ModalComponent],
  templateUrl: './andamentos-lista-publicacoes.component.html',
  styleUrl: './andamentos-lista-publicacoes.component.scss',
})
export class AndamentosListaPublicacoesComponent {
  private readonly andamentosService = inject(AndamentosService);
  private readonly toast = inject(ToastService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  /** Consulta em andamento + contador de segundos — cancelados ao trocar de processo/recarregar/destruir. */
  private consulta?: Subscription;
  private cronometro?: Subscription;

  readonly processoId = input.required<number>();

  protected readonly publicacoes = signal<PublicacaoApi[]>([]);
  protected readonly carregando = signal(false);
  protected readonly erro = signal('');
  protected readonly selecionada = signal<PublicacaoApi | null>(null);
  /** Publicação cujo "Marcar como vista" espera confirmação no modal. */
  protected readonly aConfirmar = signal<PublicacaoApi | null>(null);
  /** Segundos desde o início da consulta — espera o DataJud (~1 min), o contador mostra que não travou. */
  protected readonly segundosEsperando = signal(0);

  protected readonly totalNovos = computed(
    () => this.publicacoes().filter((p) => this.andamentosService.ehNovo(this.processoId(), p)).length,
  );

  protected readonly colunas: TableColumn<PublicacaoApi>[] = [
    { key: 'ordem', header: 'Ordem', width: '70px', align: 'center', formatter: (v) => `${v}º` },
    {
      key: 'data_disponibilizacao',
      header: 'Disponibilizado em',
      width: '130px',
      // Ordenaria pelo texto dd/MM/yyyy — "Ordem" já é a ordem cronológica.
      sortable: false,
      formatter: (v) => dataBr(v as string | null),
    },
    { key: 'data_publicacao', header: 'Publicado em', width: '110px', sortable: false, formatter: (v) => dataBr(v as string | null) },
    { key: 'fonte', header: 'Fonte', width: '120px' },
    { key: 'tribunal', header: 'Tribunal', width: '80px', formatter: (v) => texto(v) },
    { key: 'tipo', header: 'Tipo', width: '110px', formatter: (v) => texto(v) },
    { key: 'documento', header: 'Documento/Fonte', width: '150px', formatter: (v) => texto(v) },
    { key: 'conteudo_identificado', header: 'Conteúdo identificado', width: '160px', formatter: (v) => texto(v) },
    { key: 'meio', header: 'Meio', width: '140px', formatter: (v) => texto(v) },
    { key: 'orgao', header: 'Órgão', formatter: (v) => texto(v) },
    { key: 'destinatarios', header: 'Destinatários', formatter: (v) => ((v as string[]) ?? []).join(' | ') || '—' },
    { key: 'advogados', header: 'Advogados', formatter: (v) => ((v as string[]) ?? []).join(' | ') || '—' },
  ];

  /** Detalhe da publicação selecionada, no formato do Monitor — rótulos em maiúsculas + texto integral. */
  protected readonly detalhe = computed(() => {
    const p = this.selecionada();
    if (!p) {
      return '';
    }
    return [
      `DISPONIBILIZAÇÃO: ${dataBr(p.data_disponibilizacao)}`,
      `PUBLICAÇÃO: ${dataBr(p.data_publicacao)}`,
      `FONTE: ${p.fonte}`,
      `TIPO: ${texto(p.tipo)}`,
      `DOCUMENTO/FONTE: ${texto(p.documento)}`,
      `CONTEÚDO IDENTIFICADO: ${p.conteudo_identificado}`,
      `MEIO: ${texto(p.meio)}`,
      `TRIBUNAL: ${texto(p.tribunal)}`,
      `ÓRGÃO: ${texto(p.orgao)}`,
      `CLASSE: ${texto(p.classe)}`,
      `DESTINATÁRIOS: ${p.destinatarios.join(' | ') || '—'}`,
      `ADVOGADOS: ${p.advogados.join(' | ') || '—'}`,
      `SITUAÇÃO: ${p.cancelada ? `Cancelada${p.motivo_cancelamento ? ` — ${p.motivo_cancelamento}` : ''}` : 'Publicada'}`,
      `Nº DA COMUNICAÇÃO: ${p.numero_comunicacao ?? '—'}`,
      '',
      'TEXTO DA PUBLICAÇÃO:',
      p.texto || '—',
    ].join('\n');
  });

  /** Só nas novidades ainda não vistas; confirma antes de marcar. */
  protected readonly acaoVisto: TableRowAction<PublicacaoApi> = {
    label: 'Marcar como vista',
    icon: 'fa-regular fa-eye',
    iconOnly: true,
    visible: (p) => this.andamentosService.ehNovo(this.processoId(), p),
    onClick: (p) => this.aConfirmar.set(p),
  };

  // Pela própria linha, não pelo `id`: publicação do STF não tem id (todas seriam "a selecionada").
  protected readonly linhaSelecionada = (p: PublicacaoApi): Record<string, boolean> => ({
    'is-selected': this.selecionada() === p,
    'is-cancelada': p.cancelada,
    'is-novo': this.andamentosService.ehNovo(this.processoId(), p),
  });

  constructor() {
    effect(() => {
      const processoId = this.processoId();
      this.andamentosService.versao();
      untracked(() => this.carregar(processoId));
    });
    this.destroyRef.onDestroy(() => this.cancelar());
  }

  protected confirmarVisto(): void {
    const p = this.aConfirmar();
    this.aConfirmar.set(null);
    if (p) {
      this.andamentosService.marcarVistos(this.processoId(), [p]);
    }
  }

  protected marcarTodosVistos(): void {
    this.andamentosService.marcarTodosVistos(this.processoId());
  }

  protected copiarTexto(): void {
    const p = this.selecionada();
    if (!p?.texto) {
      return;
    }
    navigator.clipboard.writeText(p.texto).then(
      () => this.toast.sucesso('Texto da publicação copiado.'),
      () => this.toast.erro('Não foi possível copiar o texto.'),
    );
  }

  protected abrir(url: string | null | undefined): void {
    if (url) {
      this.document.defaultView?.open(url, '_blank', 'noopener');
    }
  }

  private carregar(processoId: number): void {
    // Resposta atrasada do processo anterior não pode sobrescrever a do atual.
    this.cancelar();
    this.carregando.set(true);
    this.erro.set('');
    this.publicacoes.set([]);
    this.selecionada.set(null);
    this.segundosEsperando.set(0);
    this.cronometro = interval(1000).subscribe(() => this.segundosEsperando.update((s) => s + 1));
    this.consulta = this.andamentosService.consultar(processoId).subscribe({
      next: (resposta) => {
        this.publicacoes.set(resposta.publicacoes);
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
}

function texto(valor: unknown): string {
  return valor == null || valor === '' ? '—' : String(valor);
}

/** `yyyy-MM-dd` → `dd/MM/yyyy` sem passar por `Date` (que leria como UTC e voltaria um dia). */
function dataBr(valor: string | null): string {
  return valor ? valor.slice(0, 10).split('-').reverse().join('/') : '—';
}

function httpErrorMessage(err: unknown): string {
  const e = err as { error?: { detail?: string; title?: string }; status?: number };
  if (e?.status === 0) {
    return 'Sem conexão com o servidor.';
  }
  return e?.error?.detail || e?.error?.title || 'Não foi possível consultar as publicações do processo.';
}
