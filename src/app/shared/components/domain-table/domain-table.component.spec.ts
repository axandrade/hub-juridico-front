import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { DomainTableComponent } from './domain-table.component';

const BASE = `${environment.apiBaseUrl}/domain`;

describe('DomainTableComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('transforma `fields` em colunas, usando `headers` quando informado', () => {
    const fixture = TestBed.createComponent(DomainTableComponent);
    fixture.componentRef.setInput('entityName', 'pessoa');
    fixture.componentRef.setInput('fields', 'nome, cpf');
    fixture.componentRef.setInput('headers', { nome: 'Nome completo' });
    fixture.detectChanges();

    http.expectOne((r) => r.url === `${BASE}/pessoa`).flush({
      conteudo: [],
      pagina: 0,
      tamanho: 10,
      total_elementos: 0,
      total_paginas: 1,
      ultima: true,
    });

    const columns = fixture.componentInstance['columns']();
    expect(columns).toEqual([
      { key: 'nome', header: 'Nome completo' },
      { key: 'cpf', header: 'cpf' },
    ]);
  });

  it('busca a página 0 ao montar e atualiza as linhas com a resposta', () => {
    const fixture = TestBed.createComponent(DomainTableComponent);
    fixture.componentRef.setInput('entityName', 'pessoa');
    fixture.componentRef.setInput('fields', 'nome');
    fixture.detectChanges();

    const req = http.expectOne((r) => r.url === `${BASE}/pessoa`);
    expect(req.request.params.get('page')).toBe('0');
    expect(req.request.params.get('fields')).toBe('nome');
    req.flush({
      conteudo: [{ nome: 'Maria' }],
      pagina: 0,
      tamanho: 10,
      total_elementos: 1,
      total_paginas: 1,
      ultima: true,
    });
    fixture.detectChanges();

    expect(fixture.componentInstance['rows']()).toEqual([{ nome: 'Maria' }]);
  });

  it('usa a key em snake_case (JSON) na coluna, mas manda `fields` em camelCase pro backend', () => {
    const fixture = TestBed.createComponent(DomainTableComponent);
    fixture.componentRef.setInput('entityName', 'pessoa');
    fixture.componentRef.setInput('fields', 'estadoCivil');
    fixture.detectChanges();

    const req = http.expectOne((r) => r.url === `${BASE}/pessoa`);
    expect(req.request.params.get('fields')).toBe('estadoCivil');
    req.flush({
      conteudo: [{ estado_civil: 'CASADO' }],
      pagina: 0,
      tamanho: 10,
      total_elementos: 1,
      total_paginas: 1,
      ultima: true,
    });
    fixture.detectChanges();

    expect(fixture.componentInstance['columns']()).toEqual([{ key: 'estado_civil', header: 'estado_civil' }]);
  });

  it('columnFields restringe quais campos viram coluna, sem afetar o que é buscado', () => {
    const fixture = TestBed.createComponent(DomainTableComponent);
    fixture.componentRef.setInput('entityName', 'pessoa');
    fixture.componentRef.setInput('fields', 'nome,cpf,cnpj');
    fixture.componentRef.setInput('columnFields', 'nome,cpf');
    fixture.detectChanges();

    const req = http.expectOne((r) => r.url === `${BASE}/pessoa`);
    expect(req.request.params.get('fields')).toBe('nome,cpf,cnpj');
    req.flush({
      conteudo: [],
      pagina: 0,
      tamanho: 10,
      total_elementos: 0,
      total_paginas: 1,
      ultima: true,
    });

    expect(fixture.componentInstance['columns']()).toEqual([
      { key: 'nome', header: 'nome' },
      { key: 'cpf', header: 'cpf' },
    ]);
  });

  it('emite pageLoaded a cada página e loadError quando a busca falha', () => {
    const fixture = TestBed.createComponent(DomainTableComponent);
    fixture.componentRef.setInput('entityName', 'pessoa');
    fixture.componentRef.setInput('fields', 'nome');
    const paginas: unknown[] = [];
    fixture.componentInstance.pageLoaded.subscribe((rows) => paginas.push(rows));
    let erro = false;
    fixture.componentInstance.loadError.subscribe(() => (erro = true));
    fixture.detectChanges();

    http.expectOne((r) => r.url === `${BASE}/pessoa`).flush({
      conteudo: [{ nome: 'Maria' }],
      pagina: 0,
      tamanho: 10,
      total_elementos: 1,
      total_paginas: 1,
      ultima: true,
    });
    expect(paginas).toEqual([[{ nome: 'Maria' }]]);

    fixture.componentInstance.refresh();
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${BASE}/pessoa`).flush('erro', { status: 500, statusText: 'Erro' });
    expect(erro).toBe(true);
  });

  it('goToFirstPage volta a página pra 0 e refaz a busca', () => {
    const fixture = TestBed.createComponent(DomainTableComponent);
    fixture.componentRef.setInput('entityName', 'pessoa');
    fixture.componentRef.setInput('fields', 'nome');
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${BASE}/pessoa`).flush({
      conteudo: [], pagina: 0, tamanho: 10, total_elementos: 0, total_paginas: 2, ultima: false,
    });

    fixture.componentInstance['onPageChange'](1);
    fixture.detectChanges();
    http.expectOne((r) => r.params.get('page') === '1').flush({
      conteudo: [], pagina: 1, tamanho: 10, total_elementos: 0, total_paginas: 2, ultima: true,
    });

    fixture.componentInstance.goToFirstPage();
    fixture.detectChanges();
    const req = http.expectOne((r) => r.url === `${BASE}/pessoa`);
    expect(req.request.params.get('page')).toBe('0');
    req.flush({ conteudo: [], pagina: 0, tamanho: 10, total_elementos: 0, total_paginas: 2, ultima: false });
  });

  it('filtro de coluna texto vira `ilike` e select vira `eq`, resetando pra página 0', () => {
    const fixture = TestBed.createComponent(DomainTableComponent);
    fixture.componentRef.setInput('entityName', 'pessoa');
    fixture.componentRef.setInput('fields', 'nome,tipo');
    fixture.componentRef.setInput('columnOverrides', {
      nome: { filter: { type: 'text' } },
      tipo: { filter: { type: 'select' } },
    });
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${BASE}/pessoa`).flush({
      conteudo: [], pagina: 0, tamanho: 10, total_elementos: 0, total_paginas: 2, ultima: false,
    });

    // vai pra página 1 antes de filtrar, pra confirmar que o filtro reseta pra 0
    fixture.componentInstance['onPageChange'](1);
    fixture.detectChanges();
    http.expectOne((r) => r.params.get('page') === '1').flush({
      conteudo: [], pagina: 1, tamanho: 10, total_elementos: 0, total_paginas: 2, ultima: true,
    });

    fixture.componentInstance['onColumnFilterChange']({ key: 'nome', value: 'Maria' });
    fixture.detectChanges();
    const reqNome = http.expectOne((r) => r.url === `${BASE}/pessoa`);
    expect(reqNome.request.params.get('page')).toBe('0');
    expect(reqNome.request.params.getAll('filter')).toEqual(["nome ilike 'Maria'"]);
    reqNome.flush({ conteudo: [], pagina: 0, tamanho: 10, total_elementos: 0, total_paginas: 1, ultima: true });

    fixture.componentInstance['onColumnFilterChange']({ key: 'tipo', value: 'FISICA' });
    fixture.detectChanges();
    const reqAmbos = http.expectOne((r) => r.url === `${BASE}/pessoa`);
    expect(reqAmbos.request.params.getAll('filter')).toEqual(["nome ilike 'Maria'", "tipo eq 'FISICA'"]);
    reqAmbos.flush({ conteudo: [], pagina: 0, tamanho: 10, total_elementos: 0, total_paginas: 1, ultima: true });
  });

  it('limpar o filtro (value vazio) remove ele da busca', () => {
    const fixture = TestBed.createComponent(DomainTableComponent);
    fixture.componentRef.setInput('entityName', 'pessoa');
    fixture.componentRef.setInput('fields', 'nome');
    fixture.componentRef.setInput('columnOverrides', { nome: { filter: { type: 'text' } } });
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${BASE}/pessoa`).flush({
      conteudo: [], pagina: 0, tamanho: 10, total_elementos: 0, total_paginas: 1, ultima: true,
    });

    fixture.componentInstance['onColumnFilterChange']({ key: 'nome', value: 'Maria' });
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${BASE}/pessoa`).flush({
      conteudo: [], pagina: 0, tamanho: 10, total_elementos: 0, total_paginas: 1, ultima: true,
    });

    fixture.componentInstance['onColumnFilterChange']({ key: 'nome', value: '' });
    fixture.detectChanges();
    const req = http.expectOne((r) => r.url === `${BASE}/pessoa`);
    expect(req.request.params.has('filter')).toBe(false);
    req.flush({ conteudo: [], pagina: 0, tamanho: 10, total_elementos: 0, total_paginas: 1, ultima: true });
  });

  it('escapa aspa simples no valor do filtro', () => {
    const fixture = TestBed.createComponent(DomainTableComponent);
    fixture.componentRef.setInput('entityName', 'pessoa');
    fixture.componentRef.setInput('fields', 'nome');
    fixture.componentRef.setInput('columnOverrides', { nome: { filter: { type: 'text' } } });
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${BASE}/pessoa`).flush({
      conteudo: [], pagina: 0, tamanho: 10, total_elementos: 0, total_paginas: 1, ultima: true,
    });

    fixture.componentInstance['onColumnFilterChange']({ key: 'nome', value: "O'Brien" });
    fixture.detectChanges();
    const req = http.expectOne((r) => r.url === `${BASE}/pessoa`);
    expect(req.request.params.getAll('filter')).toEqual(["nome ilike 'O''Brien'"]);
    req.flush({ conteudo: [], pagina: 0, tamanho: 10, total_elementos: 0, total_paginas: 1, ultima: true });
  });

  it('usa `filter.field` no lugar da key da coluna quando informado (coluna mesclada)', () => {
    const fixture = TestBed.createComponent(DomainTableComponent);
    fixture.componentRef.setInput('entityName', 'pessoa');
    fixture.componentRef.setInput('fields', 'cpf');
    fixture.componentRef.setInput('columnOverrides', {
      cpf: { filter: { type: 'text', field: 'cpf_cnpj' } },
    });
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${BASE}/pessoa`).flush({
      conteudo: [], pagina: 0, tamanho: 10, total_elementos: 0, total_paginas: 1, ultima: true,
    });

    fixture.componentInstance['onColumnFilterChange']({ key: 'cpf', value: '111' });
    fixture.detectChanges();
    const req = http.expectOne((r) => r.url === `${BASE}/pessoa`);
    expect(req.request.params.getAll('filter')).toEqual(["cpf_cnpj ilike '111'"]);
    req.flush({ conteudo: [], pagina: 0, tamanho: 10, total_elementos: 0, total_paginas: 1, ultima: true });
  });

  it('repassa a mudança de página do app-data-table pro DomainQueryService', () => {
    const fixture = TestBed.createComponent(DomainTableComponent);
    fixture.componentRef.setInput('entityName', 'pessoa');
    fixture.componentRef.setInput('fields', 'nome');
    fixture.detectChanges();
    http.expectOne((r) => r.url === `${BASE}/pessoa`).flush({
      conteudo: [],
      pagina: 0,
      tamanho: 10,
      total_elementos: 0,
      total_paginas: 2,
      ultima: false,
    });

    fixture.componentInstance['onPageChange'](1);
    fixture.detectChanges();

    const req = http.expectOne((r) => r.url === `${BASE}/pessoa`);
    expect(req.request.params.get('page')).toBe('1');
    req.flush({
      conteudo: [],
      pagina: 1,
      tamanho: 10,
      total_elementos: 0,
      total_paginas: 2,
      ultima: true,
    });
  });
});
