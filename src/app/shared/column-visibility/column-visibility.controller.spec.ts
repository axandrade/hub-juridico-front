import { computed } from '@angular/core';

import { TableColumn } from '../components/table/table-column.model';
import { ColumnVisibilityController } from './column-visibility.controller';

interface Row {
  id: number;
  nome: string;
}

const COLUMNS: TableColumn<Row>[] = [
  { key: 'id', header: 'Id' },
  { key: 'nome', header: 'Nome' },
];

/**
 * Regressão real (2026-09-19): `DataTableComponent`/`DomainModelTableComponent` chamam
 * `isVisible()` de dentro do `computed` que filtra `visibleColumns` — carregar a preferência
 * salva ali (escrevendo num signal) dispara NG0600 ("Writing to signals is not allowed in a
 * computed") assim que já existe algo em `localStorage`. Só não aparecia numa sessão de
 * navegador zerada porque, sem nada salvo, o carregamento nunca chegava a escrever o signal —
 * e num teste de componente completo, o `effect` do construtor podia "ganhar a corrida" e
 * carregar antes do `computed` ser lido pela primeira vez, mascarando o bug. Este teste chama
 * `isVisible` de dentro de um `computed` isolado, sem nenhum `effect` por perto, reproduzindo o
 * call-site exato que quebrava.
 */
describe('ColumnVisibilityController — isVisible() nunca escreve num signal', () => {
  const CHAVE = 'teste.column-visibility-controller.colunas';

  afterEach(() => {
    localStorage.removeItem(CHAVE);
  });

  it('lido de dentro de um computed não lança NG0600, mesmo com preferência já salva', () => {
    localStorage.setItem(CHAVE, JSON.stringify(['nome']));
    const controller = new ColumnVisibilityController<Row>(document, {
      columns: () => COLUMNS,
      storageKey: () => CHAVE,
    });

    const visibleColumns = computed(() => COLUMNS.filter((column) => controller.isVisible(column.key)));

    expect(() => visibleColumns()).not.toThrow();
  });

  it('sem carregarStorage(), isVisible() sozinho não aplica a preferência salva', () => {
    localStorage.setItem(CHAVE, JSON.stringify(['nome']));
    const controller = new ColumnVisibilityController<Row>(document, {
      columns: () => COLUMNS,
      storageKey: () => CHAVE,
    });

    // Sem alguém chamar `carregarStorage()` primeiro (o dono faz isso num `effect`), o padrão
    // (todas visíveis) vale — `isVisible` de propósito não carrega nada sozinho.
    expect(controller.isVisible('id')).toBe(true);
    expect(controller.isVisible('nome')).toBe(true);
  });

  it('carregarStorage() aplica a preferência salva, e dali em diante isVisible() reflete ela', () => {
    localStorage.setItem(CHAVE, JSON.stringify(['nome']));
    const controller = new ColumnVisibilityController<Row>(document, {
      columns: () => COLUMNS,
      storageKey: () => CHAVE,
    });

    controller.carregarStorage();

    expect(controller.isVisible('id')).toBe(false);
    expect(controller.isVisible('nome')).toBe(true);
  });

  it('ignora do storage colunas que não existem mais e cai no padrão', () => {
    localStorage.setItem(CHAVE, JSON.stringify(['coluna-removida']));
    const controller = new ColumnVisibilityController<Row>(document, {
      columns: () => COLUMNS,
      storageKey: () => CHAVE,
    });

    controller.carregarStorage();

    expect(controller.isVisible('id')).toBe(true);
    expect(controller.isVisible('nome')).toBe(true);
  });

  it('toggle() persiste em localStorage', () => {
    const controller = new ColumnVisibilityController<Row>(document, {
      columns: () => COLUMNS,
      storageKey: () => CHAVE,
    });

    controller.toggle('id');

    expect(JSON.parse(localStorage.getItem(CHAVE)!)).toEqual(['nome']);
  });

  it('sem storageKey, toggle() não escreve nada em localStorage', () => {
    const controller = new ColumnVisibilityController<Row>(document, {
      columns: () => COLUMNS,
    });

    controller.toggle('id');

    expect(localStorage.getItem(CHAVE)).toBeNull();
  });
});
