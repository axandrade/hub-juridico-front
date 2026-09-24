import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TableColumn } from '../table/table-column.model';
import { ColumnsMenuComponent } from './columns-menu.component';

interface Row {
  id: number;
  nome: string;
  email: string;
}

const COLUMNS: TableColumn<Row>[] = [
  { key: 'id', header: 'Id' },
  { key: 'nome', header: 'Nome' },
  { key: 'email', header: 'E-mail' },
];

function createFixture(): ComponentFixture<ColumnsMenuComponent<Row>> {
  return TestBed.createComponent(ColumnsMenuComponent) as ComponentFixture<ColumnsMenuComponent<Row>>;
}

function masterCheckbox(fixture: ComponentFixture<ColumnsMenuComponent<Row>>): HTMLInputElement {
  return (fixture.nativeElement as HTMLElement).querySelector(
    '.columns-menu__select-all input[type="checkbox"]',
  ) as HTMLInputElement;
}

describe('ColumnsMenuComponent — checkbox mestre "Todas"', () => {
  it('fica marcado quando todas as colunas estão visíveis', () => {
    const fixture = createFixture();
    fixture.componentRef.setInput('columns', COLUMNS);
    fixture.componentRef.setInput('isVisible', () => true);
    fixture.componentRef.setInput('menuOpen', true);
    fixture.detectChanges();

    const checkbox = masterCheckbox(fixture);
    expect(checkbox.checked).toBe(true);
    expect(checkbox.indeterminate).toBe(false);
  });

  it('fica indeterminado quando só algumas colunas estão visíveis', () => {
    const fixture = createFixture();
    fixture.componentRef.setInput('columns', COLUMNS);
    fixture.componentRef.setInput('isVisible', (key: string) => key === 'nome');
    fixture.componentRef.setInput('menuOpen', true);
    fixture.detectChanges();

    const checkbox = masterCheckbox(fixture);
    expect(checkbox.checked).toBe(false);
    expect(checkbox.indeterminate).toBe(true);
  });

  it('fica desmarcado (sem indeterminado) quando nenhuma coluna está visível', () => {
    const fixture = createFixture();
    fixture.componentRef.setInput('columns', COLUMNS);
    fixture.componentRef.setInput('isVisible', () => false);
    fixture.componentRef.setInput('menuOpen', true);
    fixture.detectChanges();

    const checkbox = masterCheckbox(fixture);
    expect(checkbox.checked).toBe(false);
    expect(checkbox.indeterminate).toBe(false);
  });

  it('clicar com todas visíveis emite toggleAll(false) — pede pra desmarcar', () => {
    const fixture = createFixture();
    fixture.componentRef.setInput('columns', COLUMNS);
    fixture.componentRef.setInput('isVisible', () => true);
    fixture.componentRef.setInput('menuOpen', true);
    const spy = vi.fn();
    fixture.componentInstance.toggleAll.subscribe(spy);
    fixture.detectChanges();

    masterCheckbox(fixture).dispatchEvent(new Event('change'));

    expect(spy).toHaveBeenCalledWith(false);
  });

  it('clicar com algumas (ou nenhuma) visíveis emite toggleAll(true) — pede pra marcar todas', () => {
    const fixture = createFixture();
    fixture.componentRef.setInput('columns', COLUMNS);
    fixture.componentRef.setInput('isVisible', (key: string) => key === 'nome');
    fixture.componentRef.setInput('menuOpen', true);
    const spy = vi.fn();
    fixture.componentInstance.toggleAll.subscribe(spy);
    fixture.detectChanges();

    masterCheckbox(fixture).dispatchEvent(new Event('change'));

    expect(spy).toHaveBeenCalledWith(true);
  });
});
