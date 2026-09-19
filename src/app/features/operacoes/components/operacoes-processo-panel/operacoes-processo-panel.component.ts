import { DOCUMENT, formatDate } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal, viewChild } from '@angular/core';

import { DATE_FORMAT } from '../../../../core/constants/app-constants';
import { DomainService } from '../../../../core/services/domain.service';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { DomainModelTableComponent } from '../../../../shared/components/domain-table/domain-model-table.component';
import { TableColumn } from '../../../../shared/components/table/table-column.model';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { PanelLayoutSwitcherComponent } from '../../../../shared/components/panel-layout-switcher/panel-layout-switcher.component';
import { PAINEL_LAYOUT_PADRAO, PainelLayout } from '../../../../shared/models/panel-layout';
import { ToastService } from '../../../../shared/services/toast.service';
import { OperacaoRow, STATUS_OPERACAO_LABEL, TIPO_OPERACAO_LABEL } from '../../services/operacao-api.model';
import { OperacaoFormComponent } from '../operacao-form/operacao-form.component';

/**
 * Conteúdo do painel — vive dentro do "slot" que `OperacoesComponent` monta com
 * `PanelShellController` (mesmo padrão de posicionamento/redimensionamento de Processos/
 * Advogados: divide espaço com a tabela, não fica por cima dela; o dono do controller é o pai,
 * este componente só recebe `layoutPainel`/emite `layoutPainelChange`, igual
 * `AdvogadoFormComponent`). Uma segunda `app-domain-model-table`, apontada pra `/domain/operacao`,
 * filtrada por `processoId eq {processoId} and ativo eq true`. "Novo" e clicar numa linha
 * (`rowClick`, sem ícone de editar dedicado) abrem `app-operacao-form` dentro de um `app-modal`
 * (mesmo padrão de Usuários — dialog, não painel, porque este painel já mostra a tabela). Os dois
 * ícones de ação ficam na linha (com `stopPropagation`, não disparam o `rowClick`): o que era
 * "editar" virou "marcar como cumprido" (`editAction` reaproveitado — `PATCH status='CUMPRIDO'`
 * direto, com confirmação, sem abrir o form) e "excluir" (`deleteAction`) inativa direto
 * (soft-delete), também sem abrir o form.
 *
 * A coluna "Ordem" é derivada no cliente (não existe na entidade): posição cronológica de
 * cadastro (1º = mais antiga), calculada a partir de `criadoEm`/`id` de TODA a lista carregada —
 * independe de como a tabela está ordenada/exibida (a tabela ordena por `-criadoEm`, mais
 * recente no topo, então a numeração pode aparecer "fora de ordem" visualmente, de propósito).
 *
 * Instanciado sob demanda pelo pai (`@if`), então cada abertura é uma instância nova — sem
 * precisar zerar `ordemPorId` manualmente ao trocar de processo.
 */
@Component({
  selector: 'app-operacoes-processo-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DomainModelTableComponent, ButtonComponent, ModalComponent, PanelLayoutSwitcherComponent, OperacaoFormComponent],
  templateUrl: './operacoes-processo-panel.component.html',
  styleUrl: './operacoes-processo-panel.component.scss',
})
export class OperacoesProcessoPanelComponent {
  private readonly document = inject(DOCUMENT);
  private readonly domainService = inject(DomainService);
  private readonly toast = inject(ToastService);

  readonly processoId = input.required<number>();
  readonly numeroCnj = input<string | null>(null);
  /** Posição atual do painel na tela (a página é quem aplica/persiste, ver `OperacoesComponent`). */
  readonly layoutPainel = input<PainelLayout>(PAINEL_LAYOUT_PADRAO);
  readonly layoutPainelChange = output<PainelLayout>();
  readonly fechar = output<void>();

  private readonly grade = viewChild(DomainModelTableComponent<OperacaoRow>);

  /** `null` = fechado, `'novo'` = cadastro, `número` = editando a operação daquele id. */
  protected readonly formAberto = signal<'novo' | number | null>(null);
  protected readonly operacaoIdParaForm = computed(() => {
    const v = this.formAberto();
    return typeof v === 'number' ? v : null;
  });
  protected readonly tituloForm = computed(() => (this.formAberto() === 'novo' ? 'Nova operação' : 'Editar operação'));

  protected escolherLayout(layout: PainelLayout): void {
    this.layoutPainelChange.emit(layout);
  }

  /** `ativo eq true`: excluir é soft-delete (inativar) — some da lista sem um "mostrar inativos" ainda. */
  protected readonly filtro = computed(() => `processoId eq ${this.processoId()} and ativo eq true`);

  /** id -> posição cronológica (1-based) entre as operações carregadas. */
  private readonly ordemPorId = signal<Map<number, number>>(new Map());

  protected readonly colunas: TableColumn<OperacaoRow>[] = [
    {
      key: 'ordem',
      header: 'Ordem',
      width: '70px',
      align: 'center',
      // Calculada no cliente (posição cronológica entre as carregadas) — não existe no backend, então não dá pra ordenar por ela via RQL.
      sortable: false,
      formatter: (_value, row) => {
        const posicao = this.ordemPorId().get(row.id);
        return posicao ? `${posicao}º` : '—';
      },
    },
    {
      key: 'criadoEm',
      header: 'Cadastrado em',
      width: '160px',
      formatter: (value) => (value ? formatDate(String(value), DATE_FORMAT.LONG, DATE_FORMAT.LOCALE) : '—'),
    },
    {
      key: 'tipo',
      header: 'Tipo',
      width: '120px',
      formatter: (value) => TIPO_OPERACAO_LABEL[value as OperacaoRow['tipo']] ?? String(value ?? '—'),
    },
    {
      key: 'titulo',
      header: 'Título',
      formatter: (value) => (value ? String(value) : '—'),
    },
    {
      key: 'providencia',
      header: 'Providência',
      formatter: (value) => (value ? String(value) : '—'),
    },
    {
      key: 'prazoFatal',
      header: 'Prazo',
      width: '110px',
      formatter: (value) => (value ? formatDate(String(value), DATE_FORMAT.SHORT, DATE_FORMAT.LOCALE) : '—'),
    },
    {
      key: 'status',
      header: 'Status',
      width: '120px',
      formatter: (value) =>
        STATUS_OPERACAO_LABEL[value as NonNullable<OperacaoRow['status']>] ?? String(value ?? '—'),
    },
  ];

  protected onDataLoaded(rows: OperacaoRow[]): void {
    const ordenadas = [...rows].sort((a, b) => {
      const tempoA = a.criadoEm ? new Date(a.criadoEm).getTime() : 0;
      const tempoB = b.criadoEm ? new Date(b.criadoEm).getTime() : 0;
      return tempoA !== tempoB ? tempoA - tempoB : a.id - b.id;
    });
    const mapa = new Map<number, number>();
    ordenadas.forEach((row, index) => mapa.set(row.id, index + 1));
    this.ordemPorId.set(mapa);
  }

  protected onFechar(): void {
    this.fechar.emit();
  }

  protected abrirNovo(): void {
    this.formAberto.set('novo');
  }

  /** Clique na linha da grade (`rowClick`) — sem ícone de editar dedicado. */
  protected readonly abrirEdicao = (row: OperacaoRow): void => {
    this.formAberto.set(row.id);
  };

  protected fecharForm(): void {
    this.formAberto.set(null);
  }

  /**
   * Ícone "marcar como cumprido" da grade (`editAction` — reaproveita o slot que antes abria o
   * form de edição, ver comentário da classe) — `PATCH status='CUMPRIDO'` direto, sem abrir o
   * form. Confirma antes, mesmo padrão de `excluirOperacao`. Arrow function de propósito, ver
   * `DomainModelTableComponent.editAction`.
   */
  protected readonly marcarComoCumprido = (row: OperacaoRow): void => {
    const confirmado = this.document.defaultView?.confirm(
      `Marcar a operação "${row.titulo ?? 'sem título'}" como cumprida?`,
    );
    if (!confirmado) {
      return;
    }
    this.domainService.patch({ entityName: 'operacao', entityId: row.id, body: { status: 'CUMPRIDO' } }).subscribe({
      next: () => {
        this.toast.sucesso('Operação marcada como cumprida.');
        this.grade()?.reload();
      },
      error: () => this.toast.erro('Não foi possível atualizar o status.'),
    });
  };

  /**
   * Ícone "excluir" da grade (`deleteAction`) — soft-delete: `PATCH ativo=false`, mesma
   * convenção do resto do projeto (Pessoa/Advogado/Processo — sem hard delete pra agregados).
   * Arrow function de propósito, ver `DomainModelTableComponent.deleteAction`.
   */
  protected readonly excluirOperacao = (row: OperacaoRow): void => {
    const confirmado = this.document.defaultView?.confirm(
      `Excluir a operação "${row.titulo ?? 'sem título'}"? Essa ação não pode ser desfeita por aqui.`,
    );
    if (!confirmado) {
      return;
    }
    this.domainService.patch({ entityName: 'operacao', entityId: row.id, body: { ativo: false } }).subscribe({
      next: () => {
        this.toast.sucesso('Operação excluída.');
        this.grade()?.reload();
      },
      error: () => this.toast.erro('Não foi possível excluir a operação.'),
    });
  };

  protected onOperacaoSalva(): void {
    this.formAberto.set(null);
    this.grade()?.reload();
  }
}
