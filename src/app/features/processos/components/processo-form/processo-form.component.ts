import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { PanelLayoutSwitcherComponent } from '../../../../shared/components/panel-layout-switcher/panel-layout-switcher.component';
import { PAINEL_LAYOUT_PADRAO, PainelLayout } from '../../../../shared/models/panel-layout';
import { ProcessoApi } from '../../services/processo-api.model';
import { ProcessoService } from '../../services/processo-service';
import { ProcessoObjetoComponent } from '../processo-objeto/processo-objeto.component';
import { ProcessoOutrosEnvolvidosComponent } from '../processo-outros-envolvidos/processo-outros-envolvidos.component';
import { ProcessoDadosGeraisComponent } from '../processo-dados-gerais/processo-dados-gerais.component';

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

/** Abas do painel de processo. */
type ProcessoAba = 'gerais' | 'outrosEnvolvidos' | 'objeto';

interface EditorNotice {
  key: NoticeKey;
  subject?: string;
}

/**
 * Shell do painel de cadastro/edição de processo: header (favorito/lock/layout), abas, rodapé
 * (Limpar/Reativar-Inativar/Salvar) e a orquestração — carrega a ficha por `processoId`, salva e
 * troca status. Os campos moram nas abas (`app-processo-dados-gerais`; "Outros envolvidos"
 * ainda vazia), acessadas via `viewChild`. Mesmo desenho de `advogado-form`.
 */
@Component({
  selector: 'app-processo-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonComponent,
    PanelLayoutSwitcherComponent,
    ProcessoDadosGeraisComponent,
    ProcessoOutrosEnvolvidosComponent,
    ProcessoObjetoComponent,
  ],
  templateUrl: './processo-form.component.html',
  styleUrl: './processo-form.component.scss',
})
export class ProcessoFormComponent {
  private readonly processoService = inject(ProcessoService);

  /** Id do registro a editar; `null` = novo cadastro. */
  readonly processoId = input<number | null>(null);
  readonly layoutPainel = input<PainelLayout>(PAINEL_LAYOUT_PADRAO);

  readonly saved = output<ProcessoApi>();
  readonly statusChanged = output<ProcessoApi>();
  readonly cleared = output<void>();
  readonly layoutPainelChange = output<PainelLayout>();

  /** Lido pela página (via `viewChild`) para travar a troca de ficha. */
  readonly locked = signal(false);

  private readonly dadosGerais = viewChild(ProcessoDadosGeraisComponent);
  private readonly outrosEnvolvidos = viewChild(ProcessoOutrosEnvolvidosComponent);
  private readonly objeto = viewChild(ProcessoObjetoComponent);

  /** Aba visível do painel. Volta pra "gerais" ao trocar de processo / limpar. */
  protected readonly abaAtiva = signal<ProcessoAba>('gerais');
  protected readonly abas: readonly ProcessoAba[] = ['gerais', 'outrosEnvolvidos', 'objeto'];

  protected readonly entityId = signal(0);
  protected readonly favorite = signal(false);
  protected readonly ativo = signal(true);
  protected readonly pasta = signal('');
  protected readonly notice = signal<EditorNotice>({ key: 'idle' });

  /** Título do painel: número (da aba) ou a pasta como fallback. */
  protected readonly panelTitle = () => this.dadosGerais()?.numeroValue().trim() || this.pasta();

  private lastLoadedKey = '';

  constructor() {
    effect(() => {
      const gerais = this.dadosGerais();
      const id = this.processoId();
      if (!gerais) {
        return;
      }
      const key = id !== null ? `id:${id}` : 'new';
      if (key === this.lastLoadedKey) {
        return;
      }
      this.lastLoadedKey = key;

      untracked(() => {
        this.abaAtiva.set('gerais');
        if (id !== null) {
          this.processoService.buscarCompleto(id).subscribe((found) => {
            if (found) {
              this.aplicarProcesso(found);
              this.notice.set({ key: 'idle' });
            }
          });
          return;
        }
        this.limparPainel();
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

  protected trocarAba(aba: ProcessoAba): void {
    this.abaAtiva.set(aba);
  }

  protected notificarErro(mensagem: string): void {
    this.notice.set({ key: 'saveError', subject: mensagem });
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

  protected save(): void {
    const gerais = this.dadosGerais();
    const outros = this.outrosEnvolvidos();
    const objeto = this.objeto();
    if (!gerais || !outros || !objeto) {
      return;
    }
    const validacao = gerais.validar();
    if (validacao !== 'ok') {
      this.notice.set({ key: validacao });
      return;
    }

    this.notice.set({ key: 'saving' });
    this.processoService
      .salvar({ id: this.entityId(), ...gerais.coletar(), ...outros.coletar(), ...objeto.coletar() })
      .subscribe({
        next: (salvo) => {
          this.aplicarProcesso(salvo);
          this.lastLoadedKey = `id:${salvo.id}`;
          this.notice.set({ key: 'saved', subject: this.rotuloDe(salvo) });
          this.saved.emit(salvo);
        },
        error: (err: unknown) => {
          this.notice.set({ key: 'saveError', subject: this.mensagemErroHttp(err) });
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
        this.aplicarProcesso(updated);
        this.notice.set({ key: 'statusChanged', subject: ativo ? 'ativado' : 'inativado' });
        this.statusChanged.emit(updated);
      },
      error: (err: unknown) => {
        this.notice.set({ key: 'statusError', subject: this.mensagemErroHttp(err) });
      },
    });
  }

  protected clearPanel(): void {
    this.limparPainel();
    this.lastLoadedKey = 'new';
    this.locked.set(false);
    this.notice.set({ key: 'panelCleared' });
    this.cleared.emit();
  }

  /** Aplica a ficha: estado do shell (id/favorito/ativo/pasta) + delega os campos pra aba. */
  private aplicarProcesso(p: ProcessoApi): void {
    this.entityId.set(p.id);
    this.favorite.set(p.favorito);
    this.ativo.set(p.ativo);
    this.pasta.set(p.pasta ?? '');
    this.dadosGerais()?.carregar(p);
    this.outrosEnvolvidos()?.carregar(p);
    this.objeto()?.carregar(p);
  }

  private limparPainel(): void {
    this.entityId.set(0);
    this.favorite.set(false);
    this.ativo.set(true);
    this.pasta.set('');
    this.abaAtiva.set('gerais');
    this.dadosGerais()?.limpar();
    this.outrosEnvolvidos()?.limpar();
    this.objeto()?.limpar();
  }

  private rotuloDe(p: ProcessoApi): string {
    return p.numero_cnj?.trim() || p.pasta || `#${p.id}`;
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
