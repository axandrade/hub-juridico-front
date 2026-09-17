import { ComponentRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';

import { DomainFavoritoService } from '../../../core/services/domain-favorito.service';
import { DomainService, IDomainPage, IGetDomainCommand } from '../../../core/services/domain.service';
import { DomainModelTableComponent } from './domain-model-table.component';

interface Row {
  id: number;
  nome: string;
}

/** `displayRows`/`toggleFavorito` são `protected` — só o teste precisa driblar isso. */
type TestAccess = { displayRows: () => Row[]; toggleFavorito: (row: Row, event: MouseEvent) => void };

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
