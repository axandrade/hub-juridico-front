import { ChangeDetectionStrategy, Component, ElementRef, HostListener, inject, input, output } from '@angular/core';

import { TableColumn } from '../table/table-column.model';

/**
 * Botão "Colunas" + menu de checkboxes pra mostrar/ocultar colunas de uma tabela — extraído da
 * cópia que existia em cada tela dona (Processos/Clientes/Advogados) e também dentro do toolbar
 * padrão de `DataTableComponent`/`DomainModelTableComponent`. Puramente apresentacional: quem
 * guarda estado/persistência é o `ColumnVisibilityController` de quem usa este componente.
 *
 * Fecha sozinho ao clicar fora — a tela dona não precisa mais de um
 * `@HostListener('document:click')` só pra isso.
 */
@Component({
  selector: 'app-columns-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './columns-menu.component.html',
  styleUrl: './columns-menu.component.scss',
})
export class ColumnsMenuComponent<T extends object> {
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  readonly columns = input.required<readonly TableColumn<T>[]>();
  readonly isVisible = input.required<(key: string) => boolean>();
  readonly menuOpen = input<boolean>(false);
  readonly menuOpenChange = output<boolean>();
  readonly toggleColumn = output<string>();

  protected toggleMenu(): void {
    this.menuOpenChange.emit(!this.menuOpen());
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (this.menuOpen() && !this.elementRef.nativeElement.contains(event.target as Node)) {
      this.menuOpenChange.emit(false);
    }
  }
}
