import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth.service';
import { PaginaApi } from './pessoa-api.model';
import { PessoaListQuery, PessoaStore } from './pessoa-store';

const BASE = `${environment.apiBaseUrl}/pessoas`;

const PAGINA_VAZIA: PaginaApi<never> = {
  conteudo: [],
  pagina: 0,
  tamanho: 10,
  total_elementos: 0,
  total_paginas: 1,
  ultima: true,
};

function baseQuery(over: Partial<PessoaListQuery> = {}): PessoaListQuery {
  return { page: 0, tipo: null, incluirInativos: false, tipoDocumento: null, documento: '', ...over };
}

describe('PessoaStore — parâmetros do filtro por documento', () => {
  let store: PessoaStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        PessoaStore,
        { provide: AuthService, useValue: { user: () => null } },
      ],
    });
    store = TestBed.inject(PessoaStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('envia tipoDocumento + documento (só dígitos) quando ambos preenchidos', () => {
    store.carregar(baseQuery({ tipoDocumento: 'CPF', documento: '111.444.777-35' })).subscribe();

    const req = http.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('tipoDocumento')).toBe('CPF');
    expect(req.request.params.get('documento')).toBe('11144477735');
    req.flush(PAGINA_VAZIA);
  });

  it('não envia o filtro quando falta o número', () => {
    store.carregar(baseQuery({ tipoDocumento: 'CNPJ', documento: '' })).subscribe();

    const req = http.expectOne((r) => r.url === BASE);
    expect(req.request.params.has('tipoDocumento')).toBe(false);
    expect(req.request.params.has('documento')).toBe(false);
    req.flush(PAGINA_VAZIA);
  });

  it('não envia o filtro quando falta o tipo de documento', () => {
    store.carregar(baseQuery({ tipoDocumento: null, documento: '123' })).subscribe();

    const req = http.expectOne((r) => r.url === BASE);
    expect(req.request.params.has('documento')).toBe(false);
    req.flush(PAGINA_VAZIA);
  });
});
