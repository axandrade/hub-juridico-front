import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { ClientePastaResumoApi } from './cliente-pasta-resumo.model';
import { ClientesComArquivosStore } from './clientes-com-arquivos.store';

const URL = `${environment.apiBaseUrl}/pastas/clientes`;

describe('ClientesComArquivosStore', () => {
  let store: ClientesComArquivosStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), ClientesComArquivosStore],
    });
    store = TestBed.inject(ClientesComArquivosStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const linha: ClientePastaResumoApi = {
    pessoa_id: 7,
    nome: 'Fulano de Tal',
    tipo: 'FISICA',
    qtd_pastas: 2,
    qtd_documentos: 5,
    tamanho_total_bytes: 1024,
    ultimo_envio_em: '2026-09-06T12:00:00Z',
  };

  it('carregar busca a página pedida e popula itens()/paginação', () => {
    let resultado: unknown;
    store.carregar(1).subscribe((r) => (resultado = r));

    const req = http.expectOne((r) => r.url === URL);
    expect(req.request.params.get('page')).toBe('1');
    req.flush({
      conteudo: [linha],
      pagina: 1,
      tamanho: 10,
      total_elementos: 15,
      total_paginas: 2,
      ultima: true,
    });

    expect((resultado as unknown[]).length).toBe(1);
    expect(store.itens()).toHaveLength(1);
    expect(store.itens()[0].pessoaId).toBe(7);
    expect(store.itens()[0].ultimoEnvioEm instanceof Date).toBe(true);
    expect(store.page()).toBe(1);
    expect(store.totalElements()).toBe(15);
    expect(store.last()).toBe(true);
  });

  it('carregar mapeia ultimo_envio_em nulo para null', () => {
    store.carregar(0).subscribe();
    http
      .expectOne((r) => r.url === URL)
      .flush({
        conteudo: [{ ...linha, ultimo_envio_em: null }],
        pagina: 0,
        tamanho: 10,
        total_elementos: 1,
        total_paginas: 1,
        ultima: true,
      });

    expect(store.itens()[0].ultimoEnvioEm).toBeNull();
  });
});
