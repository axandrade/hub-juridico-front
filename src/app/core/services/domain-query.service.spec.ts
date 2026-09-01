import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { DomainQueryService } from './domain-query.service';

const BASE = `${environment.apiBaseUrl}/domain`;

describe('DomainQueryService', () => {
  let service: DomainQueryService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), DomainQueryService],
    });
    service = TestBed.inject(DomainQueryService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('monta a URL com entityName, page, size e fields', () => {
    service.list('pessoa', { page: 1, fields: ['nome', 'cpf'] }).subscribe();

    const req = http.expectOne((r) => r.url === `${BASE}/pessoa`);
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('size')).toBe('10');
    expect(req.request.params.get('fields')).toBe('nome,cpf');
    req.flush({
      conteudo: [],
      pagina: 1,
      tamanho: 10,
      total_elementos: 0,
      total_paginas: 1,
      ultima: true,
    });
  });

  it('não envia `fields` quando a lista está vazia/ausente', () => {
    service.list('pessoa', { page: 0 }).subscribe();

    const req = http.expectOne((r) => r.url === `${BASE}/pessoa`);
    expect(req.request.params.has('fields')).toBe(false);
    req.flush({
      conteudo: [],
      pagina: 0,
      tamanho: 10,
      total_elementos: 0,
      total_paginas: 1,
      ultima: true,
    });
  });

  it('mapeia o envelope pra TablePagination + items', () => {
    let resultado: unknown;
    service.list('pessoa', { page: 0 }).subscribe((r) => (resultado = r));

    const req = http.expectOne((r) => r.url === `${BASE}/pessoa`);
    req.flush({
      conteudo: [{ nome: 'Maria' }],
      pagina: 0,
      tamanho: 10,
      total_elementos: 1,
      total_paginas: 1,
      ultima: true,
    });

    expect(resultado).toEqual({
      items: [{ nome: 'Maria' }],
      page: 0,
      totalPages: 1,
      totalElements: 1,
      last: true,
    });
  });
});
