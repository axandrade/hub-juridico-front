import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth.service';
import { ClientRespApi, PaginaApi } from './client-api.model';
import { ClientListQuery, ClientStore } from './client-store';

const BASE = `${environment.apiBaseUrl}/pessoas`;

const PAGINA_VAZIA: PaginaApi<never> = {
  conteudo: [],
  pagina: 0,
  tamanho: 10,
  total_elementos: 0,
  total_paginas: 1,
  ultima: true,
};

function baseQuery(over: Partial<ClientListQuery> = {}): ClientListQuery {
  return { page: 0, tipo: null, incluirInativos: false, tipoDocumento: null, documento: '', ...over };
}

describe('ClientStore — parâmetros do filtro por documento', () => {
  let store: ClientStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ClientStore,
        { provide: AuthService, useValue: { user: () => null } },
      ],
    });
    store = TestBed.inject(ClientStore);
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

describe('ClientStore — ponte com o app-domain-table', () => {
  let store: ClientStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ClientStore,
        { provide: AuthService, useValue: { user: () => null } },
      ],
    });
    store = TestBed.inject(ClientStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('definirPaginaGenerica mapeia registros da resposta genérica e populam clients()/buscar()', () => {
    const registro: ClientRespApi = {
      tipo: 'FISICA',
      id: 42,
      nome: 'Maria',
      cpf: '11144477735',
      favorito: true,
      endereco: null,
      contatos: [],
      emails: [],
      dados_administrativos: {
        status: 'ATIVO',
        modalidade: null,
        numero_contrato: '1',
        data_contrato: null,
        responsavel_interno: 'Fulano',
        indicado_por: null,
        observacoes: null,
        caminho_arquivo: null,
        cadastrado_por_id: null,
        cadastrado_por_nome: null,
        criado_em: null,
        atualizado_em: null,
      },
    };

    store.definirPaginaGenerica([registro]);

    expect(store.clients()).toHaveLength(1);
    const cliente = store.buscar(42);
    expect(cliente?.pessoa.nome).toBe('Maria');
    expect(cliente?.favorite).toBe(true);
    expect(cliente?.dossier.status).toBe('active');
  });
});
