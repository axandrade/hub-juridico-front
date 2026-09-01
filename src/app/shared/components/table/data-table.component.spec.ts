import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DataTableComponent } from './data-table.component';
import { TableColumn } from './table-column.model';

interface Row extends Record<string, unknown> {
  id: number;
  name: string;
  age: number;
}

const ROWS: Row[] = [
  { id: 1, name: 'Beatriz', age: 40 },
  { id: 2, name: 'Ana', age: 25 },
  { id: 3, name: 'Carlos', age: 33 },
];

const COLUMNS: TableColumn<Row>[] = [
  { key: 'name', header: 'Nome' },
  { key: 'age', header: 'Idade' },
];

function createFixture(): ComponentFixture<DataTableComponent<Row>> {
  return TestBed.createComponent(DataTableComponent) as ComponentFixture<DataTableComponent<Row>>;
}

describe('DataTableComponent — baseline (sem inputs opcionais)', () => {
  it('renderiza cabeçalho sem botão de ordenação, sem "Colunas" e sem rodapé de paginação', () => {
    const fixture = createFixture();
    fixture.componentRef.setInput('columns', COLUMNS);
    fixture.componentRef.setInput('data', ROWS);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('th button')).toBeNull();
    expect(el.querySelector('.data-table-columns__toggle')).toBeNull();
    expect(el.querySelector('.data-table-pagination')).toBeNull();
    expect(el.querySelectorAll('tbody tr').length).toBe(3);
  });
});

describe('DataTableComponent — ordenação', () => {
  it('ordena asc no primeiro clique, desc no segundo, e reseta pra asc ao trocar de coluna', () => {
    const fixture = createFixture();
    fixture.componentRef.setInput('columns', COLUMNS);
    fixture.componentRef.setInput('data', ROWS);
    fixture.componentRef.setInput('sortable', true);
    fixture.detectChanges();

    const nameHeaderButton = (fixture.nativeElement as HTMLElement).querySelectorAll(
      'th button',
    )[0] as HTMLButtonElement;
    const firstCellText = () =>
      (fixture.nativeElement as HTMLElement).querySelector('tbody tr td')?.textContent?.trim();

    nameHeaderButton.click();
    fixture.detectChanges();
    expect(firstCellText()).toBe('Ana');

    nameHeaderButton.click();
    fixture.detectChanges();
    expect(firstCellText()).toBe('Carlos');

    const ageHeaderButton = (fixture.nativeElement as HTMLElement).querySelectorAll(
      'th button',
    )[1] as HTMLButtonElement;
    ageHeaderButton.click();
    fixture.detectChanges();
    // asc por idade: Ana(25), Carlos(33), Beatriz(40)
    expect(firstCellText()).toBe('Ana');
  });
});

describe('DataTableComponent — visibilidade de colunas', () => {
  it('nunca deixa a última coluna visível ser ocultada', () => {
    const fixture = createFixture();
    fixture.componentRef.setInput('columns', [COLUMNS[0]]);
    fixture.componentRef.setInput('data', ROWS);
    fixture.componentRef.setInput('columnVisibility', true);
    fixture.detectChanges();

    fixture.componentInstance['toggleColumnVisibility']('name');
    fixture.detectChanges();

    expect(fixture.componentInstance['isColumnVisible']('name')).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('thead th').length).toBe(1);
  });
});

describe('DataTableComponent — busca e filtro', () => {
  it('combina searchQuery/searchableText com filterPredicate', () => {
    const fixture = createFixture();
    fixture.componentRef.setInput('columns', COLUMNS);
    fixture.componentRef.setInput('data', ROWS);
    fixture.componentRef.setInput('searchableText', (row: Row) => row.name);
    fixture.componentRef.setInput('filterPredicate', (row: Row) => row.age >= 30);
    fixture.componentRef.setInput('searchQuery', 'a');
    fixture.detectChanges();

    const names = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr'),
    ).map((tr) => tr.querySelector('td')?.textContent?.trim());
    // "a" está em todos os nomes; só sobra quem tem age >= 30: Beatriz(40), Carlos(33)
    expect(names).toEqual(['Beatriz', 'Carlos']);
  });
});

describe('DataTableComponent — pinFirst', () => {
  it('mantém a linha fixada no topo independente da coluna/direção de ordenação', () => {
    const fixture = createFixture();
    fixture.componentRef.setInput('columns', COLUMNS);
    fixture.componentRef.setInput('data', ROWS);
    fixture.componentRef.setInput('sortable', true);
    fixture.componentRef.setInput('initialSort', { key: 'name', direction: 'asc' });
    fixture.componentRef.setInput('pinFirst', (row: Row) => row.name === 'Carlos');
    fixture.detectChanges();

    const firstCellText = (fixture.nativeElement as HTMLElement).querySelector(
      'tbody tr td',
    )?.textContent?.trim();
    expect(firstCellText).toBe('Carlos');
  });
});

describe('DataTableComponent — paginação', () => {
  it('desabilita Anterior na página 0, Próxima no último, e emite a página pedida', () => {
    const fixture = createFixture();
    fixture.componentRef.setInput('columns', COLUMNS);
    fixture.componentRef.setInput('data', ROWS);
    fixture.componentRef.setInput('pagination', {
      page: 0,
      totalPages: 3,
      totalElements: 30,
      last: false,
    });
    const spy = vi.fn();
    fixture.componentInstance.pageChange.subscribe(spy);
    fixture.detectChanges();

    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '.data-table-pagination__button',
    );
    const [prevButton, nextButton] = Array.from(buttons) as HTMLButtonElement[];
    expect(prevButton.disabled).toBe(true);
    expect(nextButton.disabled).toBe(false);

    nextButton.click();
    expect(spy).toHaveBeenCalledWith(1);
  });

  it('desabilita Próxima quando `last` é true', () => {
    const fixture = createFixture();
    fixture.componentRef.setInput('columns', COLUMNS);
    fixture.componentRef.setInput('data', ROWS);
    fixture.componentRef.setInput('pagination', {
      page: 2,
      totalPages: 3,
      totalElements: 30,
      last: true,
    });
    fixture.detectChanges();

    const [, nextButton] = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.data-table-pagination__button'),
    ) as HTMLButtonElement[];
    expect(nextButton.disabled).toBe(true);
  });
});

describe('DataTableComponent — filtro por coluna', () => {
  const COLUMNS_COM_FILTRO: TableColumn<Row>[] = [
    { key: 'name', header: 'Nome', filter: { type: 'text' } },
    {
      key: 'age',
      header: 'Idade',
      filter: {
        type: 'select',
        options: [
          { value: '', label: 'Todas' },
          { value: '25', label: '25' },
        ],
      },
    },
  ];

  it('não renderiza a linha extra quando nenhuma coluna tem filter', () => {
    const fixture = createFixture();
    fixture.componentRef.setInput('columns', COLUMNS);
    fixture.componentRef.setInput('data', ROWS);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('.data-table__filter-row')).toBeNull();
  });

  it('renderiza input de texto e select conforme o filter de cada coluna', () => {
    const fixture = createFixture();
    fixture.componentRef.setInput('columns', COLUMNS_COM_FILTRO);
    fixture.componentRef.setInput('data', ROWS);
    fixture.detectChanges();

    const filterRow = (fixture.nativeElement as HTMLElement).querySelector('.data-table__filter-row')!;
    expect(filterRow.querySelector('input[type="text"]')).not.toBeNull();
    expect(filterRow.querySelectorAll('select option').length).toBe(2);
  });

  it('emite columnFilterChange só no Enter do campo de texto, não a cada tecla', () => {
    const fixture = createFixture();
    fixture.componentRef.setInput('columns', COLUMNS_COM_FILTRO);
    fixture.componentRef.setInput('data', ROWS);
    const spy = vi.fn();
    fixture.componentInstance.columnFilterChange.subscribe(spy);
    fixture.detectChanges();

    const input = (fixture.nativeElement as HTMLElement).querySelector(
      '.data-table__filter-row input',
    ) as HTMLInputElement;
    input.value = 'Ana';
    input.dispatchEvent(new Event('input'));
    expect(spy).not.toHaveBeenCalled();

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(spy).toHaveBeenCalledWith({ key: 'name', value: 'Ana' });
  });

  it('emite columnFilterChange na troca do select', () => {
    const fixture = createFixture();
    fixture.componentRef.setInput('columns', COLUMNS_COM_FILTRO);
    fixture.componentRef.setInput('data', ROWS);
    const spy = vi.fn();
    fixture.componentInstance.columnFilterChange.subscribe(spy);
    fixture.detectChanges();

    const select = (fixture.nativeElement as HTMLElement).querySelector(
      '.data-table__filter-row select',
    ) as HTMLSelectElement;
    select.value = '25';
    select.dispatchEvent(new Event('change'));

    expect(spy).toHaveBeenCalledWith({ key: 'age', value: '25' });
  });

  it('mostra o valor de columnFilterValues como valor inicial do campo', () => {
    const fixture = createFixture();
    fixture.componentRef.setInput('columns', COLUMNS_COM_FILTRO);
    fixture.componentRef.setInput('data', ROWS);
    fixture.componentRef.setInput('columnFilterValues', { name: 'Beatriz' });
    fixture.detectChanges();

    const input = (fixture.nativeElement as HTMLElement).querySelector(
      '.data-table__filter-row input',
    ) as HTMLInputElement;
    expect(input.value).toBe('Beatriz');
  });
});

describe('DataTableComponent — pinAction', () => {
  it('chama onToggle sem também disparar rowClick', () => {
    const fixture = createFixture();
    fixture.componentRef.setInput('columns', COLUMNS);
    fixture.componentRef.setInput('data', ROWS);
    const onToggle = vi.fn((_row: Row, event: MouseEvent) => event.stopPropagation());
    fixture.componentRef.setInput('pinAction', { isActive: () => false, onToggle });
    const rowClickSpy = vi.fn();
    fixture.componentInstance.rowClick.subscribe(rowClickSpy);
    fixture.detectChanges();

    const pinButton = (fixture.nativeElement as HTMLElement).querySelector(
      '.data-table__pin-button',
    ) as HTMLButtonElement;
    pinButton.click();

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(rowClickSpy).not.toHaveBeenCalled();
  });
});
