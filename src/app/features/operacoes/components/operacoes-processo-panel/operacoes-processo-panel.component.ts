import { DOCUMENT, formatDate } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal, viewChild } from '@angular/core';

import { DATE_FORMAT } from '../../../../core/constants/app-constants';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { DomainModelTableComponent } from '../../../../shared/components/domain-table/domain-model-table.component';
import { TableColumn } from '../../../../shared/components/table/table-column.model';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { PanelShellController } from '../../../../shared/panel-shell/panel-shell.controller';
import { OperacaoRow, TIPO_OPERACAO_LABEL } from '../../services/operacao-api.model';
import { OperacaoFormComponent } from '../operacao-form/operacao-form.component';

/**
 * Painel lateral fixo (sempre à direita — sem os outros modos de `PanelShellController` tipo
 * esquerda/abaixo/diálogo, só o redimensionamento por arraste, que o controller já resolve)
 * com as operações de um processo — uma segunda `app-domain-model-table`, apontada pra
 * `/domain/operacao`, filtrada por `processoId eq {processoId}`. "Novo" abre `app-operacao-form`
 * dentro de um `app-modal` (mesmo padrão de Usuários — dialog, não painel, porque este painel já
 * ocupa a lateral).
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
  imports: [DomainModelTableComponent, ButtonComponent, ModalComponent, OperacaoFormComponent],
  templateUrl: './operacoes-processo-panel.component.html',
  styleUrl: './operacoes-processo-panel.component.scss',
})
export class OperacoesProcessoPanelComponent {
  private readonly document = inject(DOCUMENT);

  readonly processoId = input.required<number>();
  readonly numeroCnj = input<string | null>(null);
  readonly fechar = output<void>();

  private readonly grade = viewChild(DomainModelTableComponent<OperacaoRow>);

  protected readonly novoAberto = signal(false);

  /**
   * Só a largura/arraste do `PanelShellController` interessam aqui (painel sempre ancorado à
   * direita) — `iniciarResize` já assume o sinal certo pra essa posição (arrastar a borda pra
   * esquerda alarga), então é só travar `layoutPainel` em `'right'` uma vez e nunca expor troca
   * de posição na UI.
   */
  protected readonly panelShell = new PanelShellController(this.document, {
    storagePrefix: 'hub-juridico.operacoes-painel',
    larguraPadrao: 720,
    larguraMin: 480,
    larguraMax: 1100,
  });

  constructor() {
    if (this.panelShell.layoutPainel() !== 'right') {
      this.panelShell.setLayoutPainel('right');
    }
  }

  protected readonly filtro = computed(() => `processoId eq ${this.processoId()}`);

  /** id -> posição cronológica (1-based) entre as operações carregadas. */
  private readonly ordemPorId = signal<Map<number, number>>(new Map());

  protected readonly colunas: TableColumn<OperacaoRow>[] = [
    {
      key: 'ordem',
      header: 'Ordem',
      width: '70px',
      align: 'center',
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
      formatter: (value) => (value ? String(value) : '—'),
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
    this.novoAberto.set(true);
  }

  protected fecharNovo(): void {
    this.novoAberto.set(false);
  }

  protected onOperacaoSalva(): void {
    this.novoAberto.set(false);
    this.grade()?.reload();
  }
}
