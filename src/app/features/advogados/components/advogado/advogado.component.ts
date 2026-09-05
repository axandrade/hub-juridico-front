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

import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { CardComponent } from '../../../../shared/components/card/card.component';
import {
  DomainRow,
  DomainTableComponent,
} from '../../../../shared/components/domain-table/domain-table.component';
import { PanelLayoutSwitcherComponent } from '../../../../shared/components/panel-layout-switcher/panel-layout-switcher.component';
import { TableColumn } from '../../../../shared/components/table/table-column.model';
import { TablePinAction } from '../../../../shared/components/table/table.model';
import { PanelShellController } from '../../../../shared/panel-shell/panel-shell.controller';
import { FavoritoService } from '../../../../shared/services/favorito.service';
import { maskCpf } from '../../../../core/auth/cpf';

const ESTADO_CIVIL_LABELS: Record<string, string> = {
  SOLTEIRO: 'Solteiro(a)',
  CASADO: 'Casado(a)',
  DIVORCIADO: 'Divorciado(a)',
  VIUVO: 'Viúvo(a)',
  UNIAO_ESTAVEL: 'União estável',
};

/**
 * Tela de Advogados — mesmo conceito de "Clientes" (tabela + painel lateral posicionável), mas
 * só leitura: o cadastro de advogado não tem controller/service de escrita (ver decisão em
 * `advogado-entity` — CRUD básico usa o mecanismo genérico `/api/v1/domain/advogado`). Por isso
 * não há `app-client-form` equivalente aqui, só um painel de detalhes — mas a posição do painel
 * (esquerda/direita/abaixo/diálogo), o redimensionamento e o mostrar/ocultar são os mesmos de
 * Clientes, via `PanelShellController` (ver o JSDoc dele).
 */
@Component({
  selector: 'app-advogado',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DomainTableComponent, CardComponent, BadgeComponent, PanelLayoutSwitcherComponent],
  templateUrl: './advogado.component.html',
  styleUrl: './advogado.component.scss',
})
export class AdvogadoComponent {
  private readonly document = inject(DOCUMENT);
  private readonly favoritoService = inject(FavoritoService);
  private readonly dtAdvogado = viewChild<DomainTableComponent>('dtAdvogado');

  /** Sobrepõe o `favorito` vindo do backend enquanto a tabela não recarrega a página (otimista). */
  private readonly favoritosOverride = signal<Map<number, boolean>>(new Map());

  protected readonly panelShell = new PanelShellController(this.document, {
    storagePrefix: 'hub-juridico.advogados',
    larguraPadrao: 380,
  });

  protected readonly selected = signal<DomainRow | null>(null);
  protected readonly loadError = signal(false);
  /** Trava o painel no advogado atual — clicar noutra linha não troca (mesmo padrão de Clientes). */
  protected readonly locked = signal(false);

  protected readonly totalAdvogados = computed(
    () => this.dtAdvogado()?.currentPagination()?.totalElements ?? 0,
  );

  protected readonly advogadoColumnOverrides: Record<string, Partial<TableColumn<DomainRow>>> = {
    nome: { header: 'Nome', width: '220px', filter: { type: 'text' } },
    oab: { header: 'OAB', width: '150px', filter: { type: 'text' } },
    cpf: {
      header: 'CPF',
      width: '140px',
      formatter: (value) => (value ? maskCpf(String(value)) : '-'),
      filter: { type: 'text' },
    },
    email: { header: 'E-mail', width: '220px', filter: { type: 'text' } },
    cidade_profissional: { header: 'Cidade', width: '160px', filter: { type: 'text' } },
    ativo: {
      header: 'Status',
      width: '110px',
      align: 'center',
      format: 'badge',
      badgeDot: true,
      formatter: (value) => (value ? 'Ativo' : 'Inativo'),
      badgeTone: (value) => (value ? 'success' : 'neutral'),
      filter: {
        type: 'select',
        options: [
          { value: '', label: 'Todos' },
          { value: 'true', label: 'Ativo' },
          { value: 'false', label: 'Inativo' },
        ],
      },
    },
  };

  protected readonly advogadoRowClass = (row: DomainRow): Record<string, boolean> => ({
    'is-selected': this.selected() !== null && Number(this.selected()?.['id']) === Number(row['id']),
    'is-favorite': this.favoritoDe(row),
    'is-inactive': !row['ativo'],
  });

  protected readonly advogadoPinFirst = (row: DomainRow): boolean => this.favoritoDe(row);

  protected readonly advogadoPinAction: TablePinAction<DomainRow> = {
    isActive: (row) => this.favoritoDe(row),
    onToggle: (row, event) => this.toggleFavorito(row, event),
    ariaLabel: 'Favoritar advogado',
  };

  private favoritoDe(row: DomainRow): boolean {
    const id = Number(row['id']);
    const sobreposto = this.favoritosOverride().get(id);
    return sobreposto ?? Boolean(row['favorito']);
  }

  protected toggleFavorito(row: DomainRow, event: MouseEvent): void {
    event.stopPropagation();
    const id = Number(row['id']);
    if (!Number.isFinite(id)) {
      return;
    }
    const desejado = !this.favoritoDe(row);
    this.favoritosOverride.update((atual) => new Map(atual).set(id, desejado));

    const atualSelecionado = this.selected();
    if (atualSelecionado !== null && Number(atualSelecionado['id']) === id) {
      this.selected.set({ ...atualSelecionado, favorito: desejado });
    }

    this.favoritoService.alternar('advogado', id, desejado).subscribe({
      error: () => this.favoritosOverride.update((atual) => new Map(atual).set(id, !desejado)),
    });
  }

  protected estadoCivilLabel(valor: unknown): string {
    return ESTADO_CIVIL_LABELS[String(valor ?? '')] ?? '-';
  }

  protected cpfLabel(valor: unknown): string {
    return valor ? maskCpf(String(valor)) : '-';
  }

  protected onLoadError(): void {
    this.loadError.set(true);
  }

  protected reloadList(): void {
    this.loadError.set(false);
    this.dtAdvogado()?.refresh();
  }

  protected selectAdvogado(row: DomainRow): void {
    const atual = this.selected();
    if (this.locked() && atual !== null && Number(atual['id']) !== Number(row['id'])) {
      return;
    }
    this.selected.set(row);
    this.panelShell.setPanelVisible(true);
  }

  protected togglePanelLock(): void {
    this.locked.update((locked) => !locked);
  }

  /** Em modo diálogo, "fechar" também esconde o painel — senão fica um diálogo vazio flutuando. */
  protected clearSelection(): void {
    this.selected.set(null);
    this.locked.set(false);
    if (this.panelShell.layoutPainel() === 'dialog') {
      this.panelShell.setPanelVisible(false);
    }
  }

  /** No modo diálogo, Esc esconde o painel (mantém o advogado selecionado). */
  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.panelShell.layoutPainel() === 'dialog' && this.panelShell.panelVisible()) {
      this.panelShell.setPanelVisible(false);
    }
  }
}
