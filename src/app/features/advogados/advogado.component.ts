import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { ButtonComponent } from '../../shared/components/button/button.component';
import { ColumnsMenuComponent } from '../../shared/components/columns-menu/columns-menu.component';
import { DomainModelTableComponent } from '../../shared/components/domain-table/domain-model-table.component';
import { TableColumn } from '../../shared/components/table/table-column.model';
import { PanelShellController } from '../../shared/panel-shell/panel-shell.controller';
import { maskCpf } from '../../core/auth/documentos-br';
import { AdvogadoDomain } from './services/advogado-api.model';
import { AdvogadoFormComponent } from './advogado-form/advogado-form.component';

/** Campos livremente buscáveis pela caixa de busca — dobrados em RQL (`or`) na filter(). */
const CAMPOS_BUSCA = ['nome', 'oab', 'email', 'cpf'] as const;

/**
 * Tela de Advogados — mesmo conceito de "Clientes": tabela + painel lateral posicionável, e o
 * painel é um formulário de criar/editar (`app-advogado-form`). "Novo" abre o painel limpo;
 * clicar numa linha abre o advogado em edição. Posição do painel, redimensionamento e
 * mostrar/ocultar vêm do `PanelShellController` (ver o JSDoc dele).
 *
 * A listagem em si é o `app-domain-model-table` (`entityName="advogado"`), que busca sozinho
 * em `/domain/advogado` (ddd-noap) — esta classe só monta o filtro RQL (busca + incluir
 * inativos) e reage aos eventos (linha clicada, salvar, etc.), sem orquestrar HTTP.
 */
@Component({
  selector: 'app-advogado',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DomainModelTableComponent, ButtonComponent, AdvogadoFormComponent, ColumnsMenuComponent],
  templateUrl: './advogado.component.html',
  styleUrl: './advogado.component.scss',
})
export class AdvogadoComponent {
  private readonly document = inject(DOCUMENT);

  private readonly form = viewChild(AdvogadoFormComponent);
  /** A grade — o botão "Colunas" da barra de ações comanda esta instância. */
  protected readonly grade = viewChild(DomainModelTableComponent<AdvogadoDomain>);

  protected readonly panelShell = new PanelShellController(this.document, {
    storagePrefix: 'hub-juridico.advogados',
    larguraPadrao: 380,
  });

  /** Id do advogado aberto no painel; `null` = cadastro novo. */
  protected readonly selectedId = signal<number | null>(null);
  /** `true` traz também advogados inativos — reflete o `incluirInativos` real do backend. */
  protected readonly incluirInativos = signal(false);
  /** Busca livre (nome / OAB / e-mail / CPF) — vira RQL, resolvida no servidor, com debounce. */
  protected readonly busca = signal('');

  protected readonly advogadoColumns: TableColumn<AdvogadoDomain>[] = [
    { key: 'nome', header: 'Nome', width: '220px' },
    { key: 'oab', header: 'OAB', width: '150px' },
    {
      key: 'cpf',
      header: 'CPF',
      width: '140px',
      formatter: (value) => (value ? maskCpf(String(value)) : '-'),
    },
    { key: 'email', header: 'E-mail', width: '220px' },
    { key: 'cidadeProfissional', header: 'Cidade', width: '160px' },
    {
      key: 'ativo',
      header: 'Status',
      width: '110px',
      align: 'center',
      format: 'badge',
      badgeDot: true,
      formatter: (value) => (value ? 'Ativo' : 'Inativo'),
      badgeTone: (value) => (value ? 'success' : 'neutral'),
    },
  ];

  protected readonly advogadoRowClass = (row: AdvogadoDomain): Record<string, boolean> => ({
    'is-selected': this.selectedId() === row.id,
    'is-inactive': !row.ativo,
  });

  /** Advogado inativo não favorita nem fixa no topo — ver `DomainModelTableComponent`. */
  protected readonly advogadoIsActive = (row: AdvogadoDomain): boolean => row.ativo;

  /** Busca com debounce (300ms) + `incluirInativos`, combinados em RQL — ver `buildFilter`. */
  private readonly buscaDebounced = toSignal(
    toObservable(this.busca).pipe(debounceTime(300), distinctUntilChanged()),
    { initialValue: this.busca() },
  );

  protected readonly filtro = computed(() => this.buildFilter(this.buscaDebounced(), this.incluirInativos()));

  /**
   * Monta o filtro RQL: `campo1 ilike '*x*' or campo2 ilike '*x*' ... and ativo eq true`.
   * A avaliação é estritamente da esquerda pra direita (RQL do ddd-noap não tem
   * parênteses/precedência — ver docs/ANALISE-ARQUITETURA.md do backend), então o `and`
   * final se aplica ao resultado acumulado de todos os `or` anteriores, não só ao último
   * termo — é exatamente o comportamento que queremos aqui.
   */
  private buildFilter(busca: string, incluirInativos: boolean): string {
    const termo = busca.trim().replace(/'/g, '');
    const clausulas: string[] = [];
    if (termo) {
      clausulas.push(CAMPOS_BUSCA.map((campo) => `${campo} ilike '*${termo}*'`).join(' or '));
    }
    if (!incluirInativos) {
      clausulas.push('ativo eq true');
    }
    return clausulas.join(' and ');
  }

  protected onBuscaInput(event: Event): void {
    this.busca.set((event.target as HTMLInputElement).value);
  }

  protected limparBusca(): void {
    this.busca.set('');
  }

  protected onToggleIncluirInativos(event: Event): void {
    this.incluirInativos.set((event.target as HTMLInputElement).checked);
  }

  protected reloadList(): void {
    this.grade()?.reload();
  }

  /** Botão "Novo" — abre o painel limpo pra cadastrar (mesmo papel de `clients.newRecord`). */
  protected novoAdvogado(): void {
    this.selectedId.set(null);
    this.panelShell.setPanelVisible(true);
  }

  protected selectAdvogado(row: AdvogadoDomain): void {
    const form = this.form();
    if (form?.locked() && this.selectedId() !== row.id) {
      form.notifyLockedSelection();
      return;
    }
    this.selectedId.set(row.id);
    this.panelShell.setPanelVisible(true);
  }

  protected onSaved(advogado: AdvogadoDomain): void {
    this.selectedId.set(advogado.id);
    this.grade()?.reload();
  }

  protected onStatusChanged(advogado: AdvogadoDomain): void {
    this.selectedId.set(advogado.id);
    this.grade()?.reload();
  }

  protected onCleared(): void {
    this.selectedId.set(null);
    this.grade()?.reload();
  }

  /** No modo diálogo, Esc fecha o diálogo (volta à posição original, mantém o advogado selecionado). */
  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.panelShell.layoutPainel() === 'dialog' && this.panelShell.panelVisible()) {
      this.panelShell.fecharDialog();
    }
  }
}
