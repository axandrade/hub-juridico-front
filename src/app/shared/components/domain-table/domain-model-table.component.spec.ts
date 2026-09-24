import { ComponentRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';

import { DomainFavoritoService } from '../../../core/services/domain-favorito.service';
import { DomainService, IDomainPage, IGetDomainCommand } from '../../../core/services/domain.service';
import { TablePinAction } from '../table/table.model';
import { DomainModelTableComponent } from './domain-model-table.component';

interface Row {
  id: number;
  nome: string;
}

/** `displayRows`/`toggleFavorito`/`onColumnDropped` são `protected` — só o teste precisa driblar isso. */
type TestAccess = {
  displayRows: () => Row[];
  toggleFavorito: (row: Row, event: MouseEvent) => void;
  onColumnDropped: (event: { previousIndex: number; currentIndex: number }) => void;
};

function asTestAccess(component: DomainModelTableComponent<Row>): TestAccess {
  return component as unknown as TestAccess;
}

function page(content: Row[]): IDomainPage<Row> {
  return {
    content,
    first: true,
    last: true,
    has_next: false,
    has_previous: false,
    has_content: content.length > 0,
    number: 0,
    page_number: 0,
    number_of_elements: content.length,
    size: 10,
    page_size: 10,
    total_elements: content.length,
    total_pages: 1,
  };
}

/**
 * Cobre o achado real (2026-09-17): favoritar deve fixar a linha no topo da listagem SEMPRE,
 * mesmo vindo de outra página — não só reordenar o que já estava carregado (regressão de uma
 * tentativa anterior, corrigida aqui de vez). O mock de `domainService.get` simula o backend de
 * verdade: filtro `id eq X or id eq Y...` (busca dos favoritos fixos, sem paginação) devolve só
 * esses ids; filtro com `id ne X` (a busca paginada normal, com os favoritos excluídos) devolve
 * o resto — reproduzindo com fidelidade o par de requisições que `DomainModelTableComponent`
 * dispara a cada busca (`resolvePinned` + `fetch`).
 */
describe('DomainModelTableComponent — favorito fixo no topo, mesmo de outra página', () => {
  let fixture: ComponentFixture<DomainModelTableComponent<Row>>;
  let favoritoMapStore: Map<number, number>;
  let allRows: Row[];

  const domainStore = {
    get: (command: IGetDomainCommand): Observable<IDomainPage<Row>> => {
      const filter = command.filter ?? '';
      const pinnedIds = [...filter.matchAll(/id eq (\d+)/g)].map((m) => Number(m[1]));
      if (pinnedIds.length > 0) {
        return of(page(allRows.filter((row) => pinnedIds.includes(row.id))));
      }
      const excludedIds = [...filter.matchAll(/id ne (\d+)/g)].map((m) => Number(m[1]));
      const resto = allRows.filter((row) => !excludedIds.includes(row.id));
      return of(page(resto.slice(0, command.size ?? 10)));
    },
  };

  const domainFavoritoStore = {
    listarTodosFavoritos: () => of(favoritoMapStore),
    favoritar: (_tipo: string, id: number) => {
      const novoId = 100 + id;
      favoritoMapStore.set(id, novoId);
      return of(novoId);
    },
    desfavoritar: (favoritoId: number) => {
      for (const [entidadeId, fid] of favoritoMapStore) {
        if (fid === favoritoId) {
          favoritoMapStore.delete(entidadeId);
        }
      }
      return of(undefined);
    },
  };

  function createFixture(): void {
    TestBed.configureTestingModule({
      imports: [DomainModelTableComponent],
      providers: [
        { provide: DomainService, useValue: domainStore },
        { provide: DomainFavoritoService, useValue: domainFavoritoStore },
      ],
    });
    fixture = TestBed.createComponent(DomainModelTableComponent<Row>);
    const ref: ComponentRef<DomainModelTableComponent<Row>> = fixture.componentRef;
    ref.setInput('entityName', 'advogado');
    ref.setInput('columns', [{ key: 'nome', header: 'Nome' }]);
    fixture.detectChanges();
  }

  it('coloca quem já era favorito fixo no topo, fora da paginação normal (sem duplicar)', () => {
    allRows = [
      { id: 1, nome: 'Ana' },
      { id: 2, nome: 'Bruno' },
      { id: 3, nome: 'Carla' },
    ];
    favoritoMapStore = new Map([[2, 202]]); // Bruno já é favorito
    createFixture();

    expect(asTestAccess(fixture.componentInstance).displayRows().map((row) => row.id)).toEqual([2, 1, 3]);
  });

  it('favorito de outra página (fora da página 1 carregada) pula fixo pro topo sozinho', () => {
    // 15 registros, página de 10: sem favorito nenhum, a página 1 mostra só os ids 1..10 — o 15
    // "está na página 2". Favoritá-lo deve trazê-lo pro topo sem o usuário navegar até lá.
    allRows = Array.from({ length: 15 }, (_, i) => ({ id: i + 1, nome: `Pessoa ${i + 1}` }));
    favoritoMapStore = new Map();
    createFixture();
    const access = asTestAccess(fixture.componentInstance);
    expect(access.displayRows().map((row) => row.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    access.toggleFavorito({ id: 15, nome: 'Pessoa 15' }, new MouseEvent('click'));

    expect(access.displayRows().map((row) => row.id)).toEqual([15, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('sem nenhum favorito, mantém a ordem que veio do servidor', () => {
    allRows = [
      { id: 1, nome: 'Ana' },
      { id: 2, nome: 'Bruno' },
      { id: 3, nome: 'Carla' },
    ];
    favoritoMapStore = new Map();
    createFixture();

    expect(asTestAccess(fixture.componentInstance).displayRows().map((row) => row.id)).toEqual([1, 2, 3]);
  });
});

/**
 * Regressão real (2026-09-19): carregar a preferência de colunas salva em `localStorage` de
 * dentro do `computed` de `visibleColumns` (via `isVisible`) dispara NG0600 ("Writing to signals
 * is not allowed in a computed") assim que já existe algo salvo — só não aparecia em testes/numa
 * sessão de navegador zerada porque, sem nada no storage, o carregamento nunca chegava a escrever
 * o signal. Corrigido movendo a carga pra um `effect` do construtor (`ColumnVisibilityController
 * .carregarStorage`), nunca de dentro da leitura (`isVisible`). Estes testes fixam esse contrato:
 * a tabela deve renderizar (e aplicar a preferência) mesmo com o storage já preenchido.
 */
describe('DomainModelTableComponent — visibilidade de colunas via localStorage', () => {
  const CHAVE = 'teste.domain-model-table.colunas';
  let fixture: ComponentFixture<DomainModelTableComponent<Row>>;

  const domainStore = {
    get: (): Observable<IDomainPage<Row>> => of(page([{ id: 1, nome: 'Ana' }])),
  };
  const domainFavoritoStore = {
    listarTodosFavoritos: () => of(new Map<number, number>()),
    favoritar: () => of(1),
    desfavoritar: () => of(undefined),
  };

  afterEach(() => {
    localStorage.removeItem(CHAVE);
  });

  function createFixture(colunas: readonly string[]): void {
    TestBed.configureTestingModule({
      imports: [DomainModelTableComponent],
      providers: [
        { provide: DomainService, useValue: domainStore },
        { provide: DomainFavoritoService, useValue: domainFavoritoStore },
      ],
    });
    fixture = TestBed.createComponent(DomainModelTableComponent<Row>);
    const ref: ComponentRef<DomainModelTableComponent<Row>> = fixture.componentRef;
    ref.setInput('entityName', 'advogado');
    ref.setInput('columns', colunas.map((key) => ({ key, header: key })));
    ref.setInput('columnVisibility', true);
    ref.setInput('columnsStorageKey', CHAVE);
    fixture.detectChanges();
  }

  it('não lança NG0600 quando já existe preferência salva antes da primeira renderização', () => {
    localStorage.setItem(CHAVE, JSON.stringify(['nome']));

    expect(() => createFixture(['id', 'nome'])).not.toThrow();
  });

  it('aplica a preferência salva já na primeira renderização', () => {
    localStorage.setItem(CHAVE, JSON.stringify(['nome']));
    createFixture(['id', 'nome']);

    expect(fixture.componentInstance.columnVisibilityState.isVisible('nome')).toBe(true);
    expect(fixture.componentInstance.columnVisibilityState.isVisible('id')).toBe(false);
  });

  it('ignora do storage colunas que não existem mais e cai no padrão (todas visíveis)', () => {
    localStorage.setItem(CHAVE, JSON.stringify(['coluna-removida']));
    createFixture(['id', 'nome']);

    expect(fixture.componentInstance.columnVisibilityState.isVisible('id')).toBe(true);
    expect(fixture.componentInstance.columnVisibilityState.isVisible('nome')).toBe(true);
  });

  it('persiste em localStorage ao alternar uma coluna', () => {
    createFixture(['id', 'nome']);

    fixture.componentInstance.columnVisibilityState.toggle('id');

    expect(JSON.parse(localStorage.getItem(CHAVE)!)).toEqual(['nome']);
  });
});

describe('DomainModelTableComponent — reordenar colunas arrastando o cabeçalho', () => {
  const CHAVE = 'teste.domain-model-table.colunas.reorder';
  let fixture: ComponentFixture<DomainModelTableComponent<Row>>;

  const domainStore = {
    get: (): Observable<IDomainPage<Row>> => of(page([{ id: 1, nome: 'Ana' }])),
  };
  const domainFavoritoStore = {
    listarTodosFavoritos: () => of(new Map<number, number>()),
    favoritar: () => of(1),
    desfavoritar: () => of(undefined),
  };

  afterEach(() => {
    localStorage.removeItem(CHAVE);
    localStorage.removeItem(`${CHAVE}.ordem`);
  });

  function createFixture(): void {
    TestBed.configureTestingModule({
      imports: [DomainModelTableComponent],
      providers: [
        { provide: DomainService, useValue: domainStore },
        { provide: DomainFavoritoService, useValue: domainFavoritoStore },
      ],
    });
    fixture = TestBed.createComponent(DomainModelTableComponent<Row>);
    const ref: ComponentRef<DomainModelTableComponent<Row>> = fixture.componentRef;
    ref.setInput('entityName', 'advogado');
    ref.setInput('columns', [
      { key: 'id', header: 'Id' },
      { key: 'nome', header: 'Nome' },
    ]);
    ref.setInput('columnReorder', true);
    ref.setInput('columnsStorageKey', CHAVE);
    fixture.detectChanges();
  }

  it('onColumnDropped() reordena visibleColumns e persiste a nova ordem', () => {
    createFixture();
    const access = fixture.componentInstance as unknown as TestAccess;

    access.onColumnDropped({ previousIndex: 0, currentIndex: 1 });
    fixture.detectChanges();

    expect(fixture.componentInstance['visibleColumns']().map((c: { key: string }) => c.key)).toEqual([
      'nome',
      'id',
    ]);
    expect(JSON.parse(localStorage.getItem(`${CHAVE}.ordem`)!)).toEqual(['nome', 'id']);
  });
});

/**
 * Modo `data` — a tabela vira "burra" (dados já buscados pelo pai, ex.: `ProcessoService`,
 * quando `/domain/{entidade}` cru não basta porque a tela precisa de nomes resolvidos de ids
 * relacionados). Sem `entityName`, nunca deve chamar `DomainService`/`DomainFavoritoService` —
 * os mocks abaixo lançam se forem chamados, provando isso.
 */
describe('DomainModelTableComponent — modo `data` (alimentada de fora, como o DataTableComponent)', () => {
  let fixture: ComponentFixture<DomainModelTableComponent<Row>>;

  const domainStoreQueNuncaDeveSerChamado = {
    get: (): Observable<IDomainPage<Row>> => {
      throw new Error('modo `data` não deveria buscar em /domain/{entidade}');
    },
  };
  const domainFavoritoStoreQueNuncaDeveSerChamado = {
    listarTodosFavoritos: (): Observable<Map<number, number>> => {
      throw new Error('modo `data` não deveria buscar favoritos nativos');
    },
    favoritar: (): Observable<number> => {
      throw new Error('modo `data` não deveria favoritar via mecanismo nativo — use pinAction');
    },
    desfavoritar: (): Observable<void> => {
      throw new Error('modo `data` não deveria desfavoritar via mecanismo nativo — use pinAction');
    },
  };

  function createFixture(rows: Row[]): void {
    TestBed.configureTestingModule({
      imports: [DomainModelTableComponent],
      providers: [
        { provide: DomainService, useValue: domainStoreQueNuncaDeveSerChamado },
        { provide: DomainFavoritoService, useValue: domainFavoritoStoreQueNuncaDeveSerChamado },
      ],
    });
    fixture = TestBed.createComponent(DomainModelTableComponent<Row>);
    const ref: ComponentRef<DomainModelTableComponent<Row>> = fixture.componentRef;
    ref.setInput('columns', [{ key: 'nome', header: 'Nome' }]);
    ref.setInput('data', rows);
    fixture.detectChanges();
  }

  it('mostra as linhas de `data` sem chamar nenhum serviço de rede', () => {
    createFixture([{ id: 1, nome: 'Ana' }, { id: 2, nome: 'Bruno' }]);

    expect(asTestAccess(fixture.componentInstance).displayRows().map((row) => row.nome)).toEqual(['Ana', 'Bruno']);
  });

  /**
   * Regressão real (2026-09-19): `favoritable` tem padrão `true`, e um teste de ordenação achou
   * que, sem `pinAction`, o corpo da linha ainda desenhava a estrela nativa (checava só
   * `favoritable()`) enquanto o cabeçalho já corretamente escondia a coluna (via `hasPinColumn()`,
   * que ignora `favoritable` no modo `data`) — desalinhava cabeçalho x corpo. Corrigido usando a
   * mesma condição (`!isExternalMode()`) nos dois lugares.
   */
  it('sem `pinAction` e sem desligar `favoritable`, não mostra a estrela nativa nem a coluna extra', () => {
    createFixture([{ id: 1, nome: 'Ana' }]);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.data-table__pin-button')).toBeNull();
    expect(el.querySelectorAll('thead tr:first-child th').length).toBe(
      el.querySelectorAll('tbody tr:first-child td').length,
    );
  });

  it('ordena no cliente via `initialSort`, sem disparar fetch nenhum', () => {
    TestBed.configureTestingModule({
      imports: [DomainModelTableComponent],
      providers: [
        { provide: DomainService, useValue: domainStoreQueNuncaDeveSerChamado },
        { provide: DomainFavoritoService, useValue: domainFavoritoStoreQueNuncaDeveSerChamado },
      ],
    });
    fixture = TestBed.createComponent(DomainModelTableComponent<Row>);
    const ref: ComponentRef<DomainModelTableComponent<Row>> = fixture.componentRef;
    ref.setInput('columns', [{ key: 'nome', header: 'Nome' }]);
    ref.setInput('data', [{ id: 1, nome: 'Carlos' }, { id: 2, nome: 'Ana' }, { id: 3, nome: 'Bruno' }]);
    ref.setInput('sortable', true);
    ref.setInput('initialSort', { key: 'nome', direction: 'asc' });
    fixture.detectChanges();

    expect(asTestAccess(fixture.componentInstance).displayRows().map((row) => row.nome)).toEqual([
      'Ana',
      'Bruno',
      'Carlos',
    ]);
  });

  it('`pinFirst` sobe a linha marcada pro topo, mesmo fora da ordenação', () => {
    TestBed.configureTestingModule({
      imports: [DomainModelTableComponent],
      providers: [
        { provide: DomainService, useValue: domainStoreQueNuncaDeveSerChamado },
        { provide: DomainFavoritoService, useValue: domainFavoritoStoreQueNuncaDeveSerChamado },
      ],
    });
    fixture = TestBed.createComponent(DomainModelTableComponent<Row>);
    const ref: ComponentRef<DomainModelTableComponent<Row>> = fixture.componentRef;
    ref.setInput('columns', [{ key: 'nome', header: 'Nome' }]);
    ref.setInput('data', [{ id: 1, nome: 'Ana' }, { id: 2, nome: 'Bruno' }, { id: 3, nome: 'Carlos' }]);
    ref.setInput('pinFirst', (row: Row) => row.id === 3);
    fixture.detectChanges();

    expect(asTestAccess(fixture.componentInstance).displayRows().map((row) => row.id)).toEqual([3, 1, 2]);
  });

  it('`pagination`/`pageChange` são controlados pelo pai — clicar em "Próxima" só emite, não busca sozinha', () => {
    TestBed.configureTestingModule({
      imports: [DomainModelTableComponent],
      providers: [
        { provide: DomainService, useValue: domainStoreQueNuncaDeveSerChamado },
        { provide: DomainFavoritoService, useValue: domainFavoritoStoreQueNuncaDeveSerChamado },
      ],
    });
    fixture = TestBed.createComponent(DomainModelTableComponent<Row>);
    const ref: ComponentRef<DomainModelTableComponent<Row>> = fixture.componentRef;
    ref.setInput('columns', [{ key: 'nome', header: 'Nome' }]);
    ref.setInput('data', [{ id: 1, nome: 'Ana' }]);
    ref.setInput('pagination', { page: 0, totalPages: 3, totalElements: 30, last: false });
    const spy = vi.fn();
    fixture.componentInstance.pageChange.subscribe(spy);
    fixture.detectChanges();

    expect(fixture.componentInstance.pagination()).toEqual({ page: 0, totalPages: 3, totalElements: 30, last: false });

    const nextButton = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '.data-table-pagination__button',
    )[1] as HTMLButtonElement;
    nextButton.click();

    expect(spy).toHaveBeenCalledWith(1);
  });

  it('`pinAction` desenha o botão genérico em vez do favoritar nativo, e nunca chama DomainFavoritoService', () => {
    TestBed.configureTestingModule({
      imports: [DomainModelTableComponent],
      providers: [
        { provide: DomainService, useValue: domainStoreQueNuncaDeveSerChamado },
        { provide: DomainFavoritoService, useValue: domainFavoritoStoreQueNuncaDeveSerChamado },
      ],
    });
    fixture = TestBed.createComponent(DomainModelTableComponent<Row>);
    const ref: ComponentRef<DomainModelTableComponent<Row>> = fixture.componentRef;
    ref.setInput('columns', [{ key: 'nome', header: 'Nome' }]);
    ref.setInput('data', [{ id: 1, nome: 'Ana' }]);
    const onToggle = vi.fn();
    const pinAction: TablePinAction<Row> = { isActive: () => true, onToggle };
    ref.setInput('pinAction', pinAction);
    fixture.detectChanges();

    const pinButton = (fixture.nativeElement as HTMLElement).querySelector(
      '.data-table__pin-button',
    ) as HTMLButtonElement;
    expect(pinButton).not.toBeNull();
    pinButton.click();

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('`rowTitle` popula o tooltip no hover da linha', () => {
    createFixture([{ id: 1, nome: 'Ana' }]);
    fixture.componentRef.setInput('rowTitle', (row: Row) => `Observação de ${row.nome}`);
    fixture.detectChanges();

    const row = (fixture.nativeElement as HTMLElement).querySelector('tbody tr') as HTMLElement;
    row.dispatchEvent(new MouseEvent('mouseenter'));
    fixture.detectChanges();

    const tooltip = (fixture.nativeElement as HTMLElement).querySelector('.data-table__tooltip-text');
    expect(tooltip?.textContent).toBe('Observação de Ana');
  });

  /**
   * Regressão real (2026-09-19): `loading` era um `signal` só de leitura interna (preenchido pelo
   * próprio fetch), então `[loading]="..."` no template de Processos dava erro do compilador
   * (NG8002, "não é uma propriedade conhecida") — só apareceu no editor, não no `tsc --noEmit`.
   * Corrigido virando `loadingInput` (alias `loading`), refletido no `loading` público quando em
   * modo `data`. Este teste fixa que o spinner responde ao input, não a um fetch que não existe.
   */
  it('`loading` reflete o input do pai — não é calculado por nenhum fetch', () => {
    createFixture([{ id: 1, nome: 'Ana' }]);

    expect(fixture.componentInstance.loading()).toBe(false);

    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    expect(fixture.componentInstance.loading()).toBe(true);

    fixture.componentRef.setInput('loading', false);
    fixture.detectChanges();
    expect(fixture.componentInstance.loading()).toBe(false);
  });

  it('clicar no cabeçalho ordena localmente (sortBy), sem disparar fetch nenhum', () => {
    TestBed.configureTestingModule({
      imports: [DomainModelTableComponent],
      providers: [
        { provide: DomainService, useValue: domainStoreQueNuncaDeveSerChamado },
        { provide: DomainFavoritoService, useValue: domainFavoritoStoreQueNuncaDeveSerChamado },
      ],
    });
    fixture = TestBed.createComponent(DomainModelTableComponent<Row>);
    const ref: ComponentRef<DomainModelTableComponent<Row>> = fixture.componentRef;
    ref.setInput('columns', [{ key: 'nome', header: 'Nome' }]);
    ref.setInput('data', [{ id: 1, nome: 'Carlos' }, { id: 2, nome: 'Ana' }, { id: 3, nome: 'Bruno' }]);
    ref.setInput('sortable', true);
    fixture.detectChanges();

    const nomeText = () =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr')).map(
        (tr) => tr.querySelector('td')?.textContent?.trim(),
      );

    const sortButton = (fixture.nativeElement as HTMLElement).querySelector(
      'thead button.data-table__sort',
    ) as HTMLButtonElement;
    expect(sortButton).not.toBeNull();

    sortButton.click();
    fixture.detectChanges();
    expect(nomeText()).toEqual(['Ana', 'Bruno', 'Carlos']);

    sortButton.click();
    fixture.detectChanges();
    expect(nomeText()).toEqual(['Carlos', 'Bruno', 'Ana']);
  });
});
