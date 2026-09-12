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
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { map, startWith } from 'rxjs';

import { ESTADOS_CIVIS } from '../../../core/models';
import { ButtonComponent } from '../../../shared/components/button/button.component';
import { PanelLayoutSwitcherComponent } from '../../../shared/components/panel-layout-switcher/panel-layout-switcher.component';
import { PAINEL_LAYOUT_PADRAO, PainelLayout } from '../../../shared/models/panel-layout';
import { CepMaskDirective } from '../../../shared/directives/cep-mask.directive';
import { CpfMaskDirective } from '../../../shared/directives/cpf-mask.directive';
import { ToastService } from '../../../shared/services/toast.service';
import { mensagensCamposInvalidos } from '../../../shared/utils/form-validacao';
import {
  AdvogadoForm,
  createAdvogadoForm,
  patchAdvogadoForm,
  readAdvogadoForm,
} from '../forms/advogado-form.factory';
import { AdvogadoApi } from '../services/advogado-api.model';
import { AdvogadoService } from '../services/advogado-service';

const ROTULOS_CAMPOS: Record<string, string> = {
  nome: 'Nome',
  cpf: 'CPF',
  email: 'E-mail',
};

export const ESTADO_CIVIL_LABELS: Record<string, string> = {
  SOLTEIRO: 'Solteiro(a)',
  CASADO: 'Casado(a)',
  DIVORCIADO: 'Divorciado(a)',
  VIUVO: 'Viúvo(a)',
  UNIAO_ESTAVEL: 'União estável',
};

/**
 * Painel de cadastro/edição de advogado — dono do `FormGroup`, carrega a ficha por id (ou vazia
 * para novo cadastro), valida e persiste via `AdvogadoService`. A página `advogado` só decide qual
 * `advogadoId` mostrar e reage aos outputs. Mesmo desenho do `client-form`, sem abas.
 */
@Component({
  selector: 'app-advogado-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    ButtonComponent,
    PanelLayoutSwitcherComponent,
    CpfMaskDirective,
    CepMaskDirective,
  ],
  templateUrl: './advogado-form.component.html',
  styleUrl: './advogado-form.component.scss',
})
export class AdvogadoFormComponent {
  private readonly advogadoService = inject(AdvogadoService);
  private readonly toast = inject(ToastService);

  /** Id do registro a editar; `null` = novo cadastro. */
  readonly advogadoId = input<number | null>(null);
  /** Posição atual do painel na tela (a página é quem aplica). */
  readonly layoutPainel = input<PainelLayout>(PAINEL_LAYOUT_PADRAO);

  readonly saved = output<AdvogadoApi>();
  readonly statusChanged = output<AdvogadoApi>();
  readonly cleared = output<void>();
  readonly layoutPainelChange = output<PainelLayout>();

  /** Lido pela página (via `viewChild`) para travar a troca de ficha. */
  readonly locked = signal(false);

  protected readonly estadosCivis = ESTADOS_CIVIS;
  protected readonly estadoCivilLabels = ESTADO_CIVIL_LABELS;

  protected readonly form: AdvogadoForm = createAdvogadoForm();
  private readonly nomeValue = toSignal(
    this.form.controls.nome.valueChanges.pipe(
      startWith(this.form.controls.nome.value),
      map(() => this.form.controls.nome.value),
    ),
    { requireSync: true },
  );

  protected readonly entityId = signal(0);
  protected readonly favorite = signal(false);
  protected readonly ativo = signal(true);
  protected readonly salvando = signal(false);
  protected readonly confirmandoInativacao = signal(false);

  protected readonly panelTitle = computed(() => this.nomeValue().trim());
  protected readonly isInactive = computed(() => !this.ativo());

  /** Última ficha carregada (`id:<n>` ou `new`) — evita recarregar à toa. */
  private lastLoadedKey = '';

  constructor() {
    effect(() => {
      const id = this.advogadoId();
      const key = id !== null ? `id:${id}` : 'new';
      if (key === this.lastLoadedKey) {
        return;
      }
      this.lastLoadedKey = key;

      untracked(() => {
        if (id !== null) {
          this.advogadoService.buscarCompleto(id).subscribe((found) => {
            if (found) {
              this.loadIntoForm(found);
            }
          });
          return;
        }
        this.resetToEmpty();
        this.locked.set(false);
      });
    });
  }

  /** Chamado pela página quando o lock impede carregar outra ficha. */
  notifyLockedSelection(): void {
    this.toast.info('Painel travado: destrave para carregar outro advogado.');
  }

  protected isPersisted(): boolean {
    return this.entityId() > 0;
  }

  protected togglePanelLock(): void {
    this.locked.update((locked) => !locked);
  }

  protected escolherLayout(layout: PainelLayout): void {
    this.layoutPainelChange.emit(layout);
  }

  protected toggleFavorite(): void {
    const id = this.entityId();
    if (id > 0) {
      const desejado = this.advogadoService.alternarFavorito(id);
      if (desejado !== null) {
        this.favorite.set(desejado);
      }
    } else {
      this.favorite.update((value) => !value);
    }
    this.toast.sucesso(
      this.favorite()
        ? `${this.panelTitle()} marcado como favorito.`
        : `${this.panelTitle()} removido dos favoritos.`,
    );
  }

  protected save(event?: Event): void {
    event?.preventDefault();

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      const mensagens = mensagensCamposInvalidos(this.form, ROTULOS_CAMPOS);
      this.toast.erro(`Preencha corretamente: ${mensagens.join('; ')}`);
      return;
    }

    const editable = readAdvogadoForm(this.form);
    const payload = {
      ...editable,
      id: this.entityId(),
      nome: editable.nome.trim().toLocaleUpperCase('pt-BR'),
    };

    this.salvando.set(true);
    this.advogadoService.salvar(payload).subscribe({
      next: (savedAdvogado) => {
        this.salvando.set(false);
        this.loadIntoForm(savedAdvogado);
        this.lastLoadedKey = `id:${savedAdvogado.id}`;
        this.toast.sucesso(`Advogado salvo: ${savedAdvogado.nome}.`);
        this.saved.emit(savedAdvogado);
      },
      error: (err: unknown) => {
        this.salvando.set(false);
        this.toast.erro(`Não foi possível salvar: ${this.httpErrorMessage(err)}`);
      },
    });
  }

  protected requestStatusChange(): void {
    if (this.isInactive()) {
      this.applyStatusChange(true);
      return;
    }
    this.confirmandoInativacao.set(true);
  }

  protected confirmInactivate(): void {
    this.confirmandoInativacao.set(false);
    this.applyStatusChange(false);
  }

  private applyStatusChange(ativo: boolean): void {
    this.advogadoService.alterarStatus(this.entityId(), ativo).subscribe({
      next: (updated) => {
        this.loadIntoForm(updated);
        this.toast.sucesso(`Advogado ${ativo ? 'ativado' : 'inativado'}.`);
        this.statusChanged.emit(updated);
      },
      error: (err: unknown) => {
        this.toast.erro(`Não foi possível alterar o status: ${this.httpErrorMessage(err)}`);
      },
    });
  }

  protected clearPanel(): void {
    this.resetToEmpty();
    this.lastLoadedKey = 'new';
    this.locked.set(false);
    this.toast.info('Painel limpo.');
    this.cleared.emit();
  }

  private resetToEmpty(): void {
    this.form.reset();
    this.form.controls.nome.enable({ emitEvent: false });
    this.form.controls.cpf.enable({ emitEvent: false });
    this.entityId.set(0);
    this.favorite.set(false);
    this.ativo.set(true);
  }

  private loadIntoForm(advogado: AdvogadoApi): void {
    this.entityId.set(advogado.id);
    this.favorite.set(advogado.favorito);
    this.ativo.set(advogado.ativo);
    patchAdvogadoForm(this.form, advogado);
    // Nome e CPF são imutáveis no PUT — travados quando já existe registro.
    this.form.controls.nome.disable({ emitEvent: false });
    this.form.controls.cpf.disable({ emitEvent: false });
  }

  /** Extrai a mensagem legível de um erro HTTP (ProblemDetail do backend). */
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
