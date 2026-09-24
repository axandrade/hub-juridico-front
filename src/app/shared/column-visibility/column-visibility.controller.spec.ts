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

const COLUNAS_3: TableColumn<Row & { email: string }>[] = [
  { key: 'id', header: 'Id' },
  { key: 'nome', header: 'Nome' },
  { key: 'email', header: 'E-mail' },
];

describe('ColumnVisibilityController — reordenar arrastando o cabeçalho', () => {
  const CHAVE = 'teste.column-visibility-controller.ordem';

  afterEach(() => {
    localStorage.removeItem(CHAVE);
    localStorage.removeItem(`${CHAVE}.ordem`);
  });

  it('sem ordem salva, orderedColumns() devolve a ordem original de columns()', () => {
    const controller = new ColumnVisibilityController(document, { columns: () => COLUNAS_3 });

    expect(controller.orderedColumns().map((c) => c.key)).toEqual(['id', 'nome', 'email']);
  });

  it('reorder() move a coluna e orderedColumns() passa a refletir a nova ordem', () => {
    const controller = new ColumnVisibilityController(document, { columns: () => COLUNAS_3 });

    controller.reorder(0, 2); // arrasta "Id" (índice 0) pro lugar do último (índice 2)

    expect(controller.orderedColumns().map((c) => c.key)).toEqual(['nome', 'email', 'id']);
  });

  it('reorder() persiste a ordem numa chave derivada (`<storageKey>.ordem`)', () => {
    const controller = new ColumnVisibilityController(document, {
      columns: () => COLUNAS_3,
      storageKey: () => CHAVE,
    });

    controller.reorder(0, 2);

    expect(JSON.parse(localStorage.getItem(`${CHAVE}.ordem`)!)).toEqual(['nome', 'email', 'id']);
  });

  it('carregarOrdemStorage() aplica a ordem salva', () => {
    localStorage.setItem(`${CHAVE}.ordem`, JSON.stringify(['email', 'id', 'nome']));
    const controller = new ColumnVisibilityController(document, {
      columns: () => COLUNAS_3,
      storageKey: () => CHAVE,
    });

    controller.carregarOrdemStorage();

    expect(controller.orderedColumns().map((c) => c.key)).toEqual(['email', 'id', 'nome']);
  });

  it('colunas novas (fora da ordem salva) entram no fim, na ordem original', () => {
    localStorage.setItem(`${CHAVE}.ordem`, JSON.stringify(['email', 'id'])); // "nome" não estava na lista quando foi salva
    const controller = new ColumnVisibilityController(document, {
      columns: () => COLUNAS_3,
      storageKey: () => CHAVE,
    });

    controller.carregarOrdemStorage();

    expect(controller.orderedColumns().map((c) => c.key)).toEqual(['email', 'id', 'nome']);
  });

  it('reordena só entre as colunas visíveis, mantendo as ocultas na posição relativa absoluta', () => {
    const controller = new ColumnVisibilityController(document, { columns: () => COLUNAS_3 });
    controller.toggle('id'); // oculta "id" — mantém "nome" e "email" visíveis (índices 0 e 1 na lista visível)

    // Arrasta "email" (índice 1 dentre as visíveis) pra antes de "nome" (índice 0).
    controller.reorder(1, 0);

    // "id" continua oculta e no mesmo slot absoluto (posição 0); só "nome"/"email" trocaram de lugar entre si.
    expect(controller.orderedColumns().map((c) => c.key)).toEqual(['id', 'email', 'nome']);
    expect(controller.isVisible('id')).toBe(false);
  });
});

describe('ColumnVisibilityController — marcar/desmarcar todas', () => {
  const CHAVE = 'teste.column-visibility-controller.marcar-todas';

  afterEach(() => {
    localStorage.removeItem(CHAVE);
  });

  it('toggleAll(true) marca todas as colunas', () => {
    const controller = new ColumnVisibilityController(document, { columns: () => COLUNAS_3 });
    controller.toggle('id'); // começa com uma oculta

    controller.toggleAll(true);

    expect(controller.isVisible('id')).toBe(true);
    expect(controller.isVisible('nome')).toBe(true);
    expect(controller.isVisible('email')).toBe(true);
  });

  it('toggleAll(false) nunca zera de verdade — mantém a primeira coluna visível', () => {
    const controller = new ColumnVisibilityController(document, { columns: () => COLUNAS_3 });

    controller.toggleAll(false);

    expect(controller.isVisible('id')).toBe(true);
    expect(controller.isVisible('nome')).toBe(false);
    expect(controller.isVisible('email')).toBe(false);
  });

  it('persiste em localStorage nos dois sentidos', () => {
    const controller = new ColumnVisibilityController(document, {
      columns: () => COLUNAS_3,
      storageKey: () => CHAVE,
    });

    controller.toggleAll(false);
    expect(JSON.parse(localStorage.getItem(CHAVE)!)).toEqual(['id']);

    controller.toggleAll(true);
    expect(JSON.parse(localStorage.getItem(CHAVE)!)).toEqual(['id', 'nome', 'email']);
  });
});
