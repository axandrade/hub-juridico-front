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
import { FormControl, FormGroup, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { Observable, catchError, map, of, startWith, switchMap } from 'rxjs';

import { cpfValidator, onlyDigits } from '../../../core/auth/documentos-br';
import { ESTADOS_CIVIS, EstadoCivil } from '../../../core/models';
import { DomainFavoritoService } from '../../../core/services/domain-favorito.service';
import { DomainService } from '../../../core/services/domain.service';
import { PanelFooterActionsComponent } from '../../../shared/components/panel-footer-actions/panel-footer-actions.component';
import { PanelLayoutSwitcherComponent } from '../../../shared/components/panel-layout-switcher/panel-layout-switcher.component';
import { PAINEL_LAYOUT_PADRAO, PainelLayout } from '../../../shared/models/panel-layout';
import { CepMaskDirective } from '../../../shared/directives/cep-mask.directive';
import { CpfMaskDirective } from '../../../shared/directives/cpf-mask.directive';
import { ToastService } from '../../../shared/services/toast.service';
import { mensagensCamposInvalidos } from '../../../shared/utils/form-validacao';
import { AdvogadoDomain, AdvogadoEditavel, AdvogadoWriteApi } from '../services/advogado-api.model';

/**
 * `FormGroup` do cadastro/edição — sem arquivo de "factory" separado (`generateForm`/
 * `patchForm`/leitura no `save()` ficam direto na classe, mesmo padrão do cev-front real
 * — ver `DataColaboradorComponent.generateform()`/`pathValueColaborador()`/`submit()`, que
 * fazem exatamente isso dentro do próprio componente, sem outro arquivo).
 */
type AdvogadoForm = FormGroup<{
  nome: FormControl<string>;
  cpf: FormControl<string>;
  rg: FormControl<string>;
  oab: FormControl<string>;
  profissao: FormControl<string>;
  nacionalidade: FormControl<string>;
  estadoCivil: FormControl<string>;
  email: FormControl<string>;
  telefoneWhatsapp: FormControl<string>;
  enderecoProfissional: FormControl<string>;
  cepProfissional: FormControl<string>;
  cidadeProfissional: FormControl<string>;
  observacoes: FormControl<string>;
}>;

function text(validators: ValidatorFn[] = []): FormControl<string> {
  return new FormControl('', { nonNullable: true, validators });
}

/** Sem service dedicado: `/domain/advogado` é só mais um uso do `DomainService` genérico
 *  (ver decisão de não criar um `XxxService` por entidade) — as 3 operações que o painel
 *  precisa (buscar/salvar/mudar status) ficam direto aqui, únicas consumidoras. */
const ENTITY = 'advogado';

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
 * para novo cadastro), valida e persiste direto via `DomainService` (`/domain/advogado` —
 * sem um `AdvogadoService` dedicado, ver decisão de não criar um wrapper por entidade). A
 * página `advogado` só decide qual `advogadoId` mostrar e reage aos outputs. Mesmo desenho do
 * `client-form`, sem abas.
 */
@Component({
  selector: 'app-advogado-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    PanelFooterActionsComponent,
    PanelLayoutSwitcherComponent,
    CpfMaskDirective,
    CepMaskDirective,
  ],
  templateUrl: './advogado-form.component.html',
  styleUrl: './advogado-form.component.scss',
})
export class AdvogadoFormComponent {
  private readonly domainService = inject(DomainService);
  private readonly domainFavoritoService = inject(DomainFavoritoService);
  private readonly toast = inject(ToastService);

  /** Id do registro a editar; `null` = novo cadastro. */
  readonly advogadoId = input<number | null>(null);
  /** Posição atual do painel na tela (a página é quem aplica). */
  readonly layoutPainel = input<PainelLayout>(PAINEL_LAYOUT_PADRAO);

  readonly saved = output<AdvogadoDomain>();
  readonly statusChanged = output<AdvogadoDomain>();
  readonly cleared = output<void>();
  readonly layoutPainelChange = output<PainelLayout>();

  /** Lido pela página (via `viewChild`) para travar a troca de ficha. */
  readonly locked = signal(false);

  protected readonly estadosCivis = ESTADOS_CIVIS;
  protected readonly estadoCivilLabels = ESTADO_CIVIL_LABELS;

  protected readonly form: AdvogadoForm = new FormGroup({
    nome: text([Validators.required]),
    cpf: text([cpfValidator]),
    rg: text(),
    oab: text(),
    profissao: text(),
    nacionalidade: text(),
    estadoCivil: text(),
    email: text([Validators.email]),
    telefoneWhatsapp: text(),
    enderecoProfissional: text(),
    cepProfissional: text(),
    cidadeProfissional: text(),
    observacoes: text(),
  });
  private readonly nomeValue = toSignal(
    this.form.controls.nome.valueChanges.pipe(
      startWith(this.form.controls.nome.value),
      map(() => this.form.controls.nome.value),
    ),
    { requireSync: true },
  );

  protected readonly entityId = signal(0);
  protected readonly ativo = signal(true);
  protected readonly salvando = signal(false);
  protected readonly confirmandoInativacao = signal(false);
  /** Id da linha `Favorito` (não do advogado) — `null` = não favoritado. Ver `DomainFavoritoService`. */
  private readonly favoritoId = signal<number | null>(null);
  protected readonly favorite = computed(() => this.favoritoId() !== null);
  protected readonly favoritoBusy = signal(false);

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
          this.buscarCompleto(id).subscribe((found) => {
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
    if (id <= 0 || this.favoritoBusy()) {
      return;
    }
    this.favoritoBusy.set(true);
    const currentFavoritoId = this.favoritoId();
    const request$ = currentFavoritoId != null
      ? this.domainFavoritoService.desfavoritar(currentFavoritoId).pipe(map(() => null as number | null))
      : this.domainFavoritoService.favoritar('advogado', id).pipe(map((novoId) => novoId as number | null));

    request$.subscribe({
      next: (novoFavoritoId) => {
        this.favoritoId.set(currentFavoritoId != null ? null : novoFavoritoId);
        this.favoritoBusy.set(false);
        this.toast.sucesso(
          this.favorite()
            ? `${this.panelTitle()} marcado como favorito.`
            : `${this.panelTitle()} removido dos favoritos.`,
        );
      },
      error: (err: unknown) => {
        this.favoritoBusy.set(false);
        this.toast.erro(`Não foi possível favoritar: ${this.httpErrorMessage(err)}`);
      },
    });
  }

  protected save(event?: Event): void {
    event?.preventDefault();

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      const mensagens = mensagensCamposInvalidos(this.form, ROTULOS_CAMPOS);
      this.toast.erro(`Preencha corretamente: ${mensagens.join('; ')}`);
      return;
    }

    const raw = this.form.getRawValue();
    const payload = {
      ...raw,
      id: this.entityId(),
      nome: raw.nome.trim().toLocaleUpperCase('pt-BR'),
      // CpfMaskDirective guarda o valor mascarado no FormControl de propósito (pra manter o
      // <input> sincronizado) — quem manda pro backend precisa tirar a formatação, mesmo
      // padrão do AuthService.login. Sem isso, "017.869.783-42" (14 chars) estoura o
      // varchar(11) da coluna cpf no banco.
      cpf: onlyDigits(raw.cpf),
      estadoCivil: (raw.estadoCivil || '') as EstadoCivil | '',
    };

    this.salvando.set(true);
    this.salvar(payload).subscribe({
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
    this.alterarStatus(this.entityId(), ativo).subscribe({
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
    this.ativo.set(true);
    this.favoritoId.set(null);
  }

  private loadIntoForm(advogado: AdvogadoDomain): void {
    this.entityId.set(advogado.id);
    this.ativo.set(advogado.ativo);
    this.form.patchValue(
      {
        nome: advogado.nome ?? '',
        cpf: advogado.cpf ?? '',
        rg: advogado.rg ?? '',
        oab: advogado.oab ?? '',
        profissao: advogado.profissao ?? '',
        nacionalidade: advogado.nacionalidade ?? '',
        estadoCivil: advogado.estadoCivil ?? '',
        email: advogado.email ?? '',
        telefoneWhatsapp: advogado.telefoneWhatsapp ?? '',
        enderecoProfissional: advogado.enderecoProfissional ?? '',
        cepProfissional: advogado.cepProfissional ?? '',
        cidadeProfissional: advogado.cidadeProfissional ?? '',
        observacoes: advogado.observacoes ?? '',
      },
      { emitEvent: false },
    );
    this.form.markAsPristine();
    this.form.markAsUntouched();
    this.form.updateValueAndValidity({ emitEvent: false });
    // Nome e CPF ficam travados na UI quando já existe registro (o backend genérico
    // não impede a troca no PATCH, mas a convenção da tela é manter os dois imutáveis).
    this.form.controls.nome.disable({ emitEvent: false });
    this.form.controls.cpf.disable({ emitEvent: false });
    this.domainFavoritoService
      .listarFavoritos('advogado', [advogado.id])
      .subscribe((map) => this.favoritoId.set(map.get(advogado.id) ?? null));
  }

  /** Ficha por id direto do backend `/domain/advogado/{id}`. */
  private buscarCompleto(id: number): Observable<AdvogadoDomain | null> {
    return this.domainService
      .get<AdvogadoDomain>({ entityName: ENTITY, entityId: id })
      .pipe(catchError(() => of(null)));
  }

  /**
   * Cria (`POST`, sem id) ou atualiza (`PATCH`, com id) e devolve a ficha completa — o
   * backend responde só `{id}` no create e `204` no update, por isso sempre encadeamos um
   * `get()` por id (ver `DomainService`).
   */
  private salvar(advogado: AdvogadoEditavel): Observable<AdvogadoDomain> {
    const comum: AdvogadoWriteApi = {
      nacionalidade: advogado.nacionalidade || null,
      estado_civil: advogado.estadoCivil || null,
      profissao: advogado.profissao || null,
      oab: advogado.oab || null,
      rg: advogado.rg || null,
      email: advogado.email || null,
      telefone_whatsapp: advogado.telefoneWhatsapp || null,
      endereco_profissional: advogado.enderecoProfissional || null,
      cep_profissional: advogado.cepProfissional || null,
      cidade_profissional: advogado.cidadeProfissional || null,
      observacoes: advogado.observacoes || null,
    };

    if (advogado.id > 0) {
      return this.domainService
        .patch({ entityName: ENTITY, entityId: advogado.id, body: comum })
        .pipe(switchMap(() => this.domainService.get<AdvogadoDomain>({ entityName: ENTITY, entityId: advogado.id })));
    }

    const criar: AdvogadoWriteApi = { ...comum, nome: advogado.nome, cpf: advogado.cpf || undefined };
    return this.domainService
      .post({ entityName: ENTITY, body: criar })
      .pipe(switchMap((created) => this.domainService.get<AdvogadoDomain>({ entityName: ENTITY, entityId: created.id })));
  }

  /** Ativa/inativa via `PATCH /domain/advogado/{id}` (campo `ativo` direto). */
  private alterarStatus(id: number, ativo: boolean): Observable<AdvogadoDomain> {
    return this.domainService
      .patch({ entityName: ENTITY, entityId: id, body: { ativo } })
      .pipe(switchMap(() => this.domainService.get<AdvogadoDomain>({ entityName: ENTITY, entityId: id })));
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
