import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { Subscription } from 'rxjs';
import { formatDate } from '@angular/common';

import { PanelLayoutSwitcherComponent } from '../../../../shared/components/panel-layout-switcher/panel-layout-switcher.component';
import { PAINEL_LAYOUT_PADRAO, PainelLayout } from '../../../../shared/models/panel-layout';
import { DateFormatPipe } from '../../../../shared/pipes/date-format.pipe';
import { ToastService } from '../../../../shared/services/toast.service';
import { DATE_FORMAT } from '../../../../core/constants/app-constants';
import { AndamentosListaAndamentosComponent } from '../andamentos-lista-andamentos/andamentos-lista-andamentos.component';
import { AndamentosListaPublicacoesComponent } from '../andamentos-lista-publicacoes/andamentos-lista-publicacoes.component';
import { AndamentosService, SituacaoFonteApi } from '../../services/andamentos.service';
import { AndamentosVisaoGeralComponent } from '../andamentos-visao-geral/andamentos-visao-geral.component';

type AndamentosAba = 'visaoGeral' | 'andamentos' | 'publicacoes';

/**
 * Conteúdo do painel de Andamentos Automáticos — mesmo cabeçalho de `OperacoesProcessoPanelComponent`
 * (título + número CNJ, fechar e seletor de posição), com as abas "Visão Geral", "Andamentos" e "Publicações" no
 * mesmo desenho das abas do cadastro de operação. O dono do `PanelShellController` é o
 * `app-processo-lista-painel`; este componente só recebe `layoutPainel`/emite `layoutPainelChange`.
 *
 * Cada aba é um componente próprio que recebe o `processoId` e carrega seus dados (padrão das abas
 * de Operação/Processo) — a consulta (DataJud + STF) é compartilhada entre elas pelo `AndamentosService`.
 * As abas "Andamentos" e "Publicações" mostram quantas novidades o usuário ainda não viu. O
 * "Atualizado em" e o botão "Atualizar" ficam logo abaixo das abas, visíveis em todas — a data vem da
 * mesma consulta compartilhada (o cache do serviço evita requisição a mais). Fonte que não respondeu
 * vira um toast de erro: se o que aparece é a consulta gravada antes (e de quando) ou se o painel
 * está sem os dados dela.
 */
@Component({
  selector: 'app-andamentos-automaticos-processo-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PanelLayoutSwitcherComponent,
    AndamentosVisaoGeralComponent,
    AndamentosListaAndamentosComponent,
    AndamentosListaPublicacoesComponent,
    DateFormatPipe,
  ],
  templateUrl: './andamentos-automaticos-processo-panel.component.html',
  styleUrl: './andamentos-automaticos-processo-panel.component.scss',
})
export class AndamentosAutomaticosProcessoPanelComponent {
  private readonly andamentosService = inject(AndamentosService);
  private readonly toast = inject(ToastService);
  private consulta?: Subscription;

  readonly processoId = input.required<number>();
  readonly numeroCnj = input<string | null>(null);
  readonly clienteNome = input<string | null>(null);
  /** Posição atual do painel na tela (quem aplica/persiste é o `app-processo-lista-painel`). */
  readonly layoutPainel = input<PainelLayout>(PAINEL_LAYOUT_PADRAO);
  readonly layoutPainelChange = output<PainelLayout>();
  readonly fechar = output<void>();

  protected readonly abas: readonly AndamentosAba[] = ['visaoGeral', 'andamentos', 'publicacoes'];
  protected readonly abaAtiva = signal<AndamentosAba>('visaoGeral');
  protected readonly novos = computed(() => this.andamentosService.novos(this.processoId()));
  protected readonly consultadoEm = signal<string | null>(null);
  protected readonly carregando = signal(false);

  constructor() {
    effect(() => {
      const processoId = this.processoId();
      this.andamentosService.versao();
      untracked(() => this.carregar(processoId));
    });
    inject(DestroyRef).onDestroy(() => this.consulta?.unsubscribe());
  }

  /** Descarta o cache do processo — as três abas refazem a consulta juntas. */
  protected atualizar(): void {
    this.andamentosService.recarregar(this.processoId());
  }

  protected trocarAba(aba: AndamentosAba): void {
    this.abaAtiva.set(aba);
  }

  protected escolherLayout(layout: PainelLayout): void {
    this.layoutPainelChange.emit(layout);
  }

  protected onFechar(): void {
    this.fechar.emit();
  }

  private mensagemFalha(fonte: SituacaoFonteApi): string {
    if (!fonte.consultado_em) {
      return `${fonte.fonte} não respondeu — o painel está sem os dados de lá.`;
    }
    const quando = formatDate(fonte.consultado_em, 'dd/MM/yyyy HH:mm', DATE_FORMAT.LOCALE);
    return `${fonte.fonte} não respondeu — exibindo dados de ${quando}.`;
  }

  /** Erro fica por conta das abas (a Visão Geral mostra a mensagem); aqui só some a data. */
  private carregar(processoId: number): void {
    this.consulta?.unsubscribe();
    this.carregando.set(true);
    this.consultadoEm.set(null);
    this.consulta = this.andamentosService.consultar(processoId).subscribe({
      next: (resposta) => {
        this.consultadoEm.set(resposta.consultado_em);
        resposta.fontes.filter((f) => f.falhou).forEach((f) => this.toast.erro(this.mensagemFalha(f)));
        this.carregando.set(false);
      },
      error: () => this.carregando.set(false),
    });
  }
}
