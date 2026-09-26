import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Subscription } from 'rxjs';

import { DataTableComponent } from '../../../../shared/components/table/data-table.component';
import { TableColumn } from '../../../../shared/components/table/table-column.model';
import { ToastService } from '../../../../shared/services/toast.service';
import { PublicacaoApi, PublicacoesService } from '../../services/publicacoes.service';

/**
 * Aba "Publicações" do painel de Andamentos Automáticos — publicações do processo no DJEN
 * (Comunica PJe) e no DJe do STF, numa lista só (coluna Fonte), no layout do protótipo (Monitor de
 * Processos): tabela + detalhe da publicação selecionada embaixo, com "Copiar texto", "Abrir
 * certidão" e "Abrir publicação". Carrega pelo `processoId` (padrão das abas do projeto); as duas
 * fontes respondem em poucos segundos, sem cache. Só falha do Comunica vira erro na aba — falha
 * do STF só deixa as publicações dele de fora.
 *
 * Coluna "Novo" do protótipo fica de fora pelo mesmo motivo do "Somente novos" da aba Andamentos:
 * depende de gravar as consultas pra comparar com a anterior.
 */
@Component({
  selector: 'app-andamentos-lista-publicacoes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTableComponent],
  templateUrl: './andamentos-lista-publicacoes.component.html',
  styleUrl: './andamentos-lista-publicacoes.component.scss',
})
export class AndamentosListaPublicacoesComponent {
  private readonly publicacoesService = inject(PublicacoesService);
  private readonly toast = inject(ToastService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  /** Consulta em andamento — cancelada ao trocar de processo/destruir. */
  private consulta?: Subscription;

  readonly processoId = input.required<number>();

  protected readonly publicacoes = signal<PublicacaoApi[]>([]);
  protected readonly carregando = signal(false);
  protected readonly erro = signal('');
  protected readonly selecionada = signal<PublicacaoApi | null>(null);

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

  protected readonly linhaSelecionada = (p: PublicacaoApi): Record<string, boolean> => ({
    'is-selected': this.selecionada()?.id === p.id,
    'is-cancelada': p.cancelada,
  });

  constructor() {
    effect(() => {
      const processoId = this.processoId();
      untracked(() => this.carregar(processoId));
    });
    this.destroyRef.onDestroy(() => this.consulta?.unsubscribe());
  }

  protected selecionar(p: PublicacaoApi): void {
    this.selecionada.set(p);
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
    this.consulta?.unsubscribe();
    this.carregando.set(true);
    this.erro.set('');
    this.publicacoes.set([]);
    this.selecionada.set(null);
    this.consulta = this.publicacoesService.consultar(processoId).subscribe({
      next: (resposta) => {
        this.publicacoes.set(resposta.publicacoes);
        this.carregando.set(false);
      },
      error: (err: unknown) => {
        this.erro.set(httpErrorMessage(err));
        this.carregando.set(false);
      },
    });
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
  return e?.error?.detail || e?.error?.title || 'Não foi possível consultar o Comunica/DJEN.';
}
