import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { AdvogadoApi } from './advogado-api.model';
import { AdvogadoStore } from './advogado-store';

const BASE = `${environment.apiBaseUrl}/advogados`;

describe('AdvogadoStore', () => {
  let store: AdvogadoStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), AdvogadoStore],
    });
    store = TestBed.inject(AdvogadoStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const advogado: AdvogadoApi = {
    id: 7,
    favorito: false,
    nome: 'Fulano',
    nacionalidade: 'Brasileira',
    estado_civil: null,
    profissao: null,
    oab: '12345',
    cpf: '11144477735',
    rg: null,
    email: 'fulano@exemplo.com',
    telefone_whatsapp: null,
    endereco_profissional: null,
    cep_profissional: null,
    cidade_profissional: 'Fortaleza',
    ativo: true,
    observacoes: null,
  };

  it('carregar manda os filtros reais como query params e popula advogados()/totais', () => {
    let resultado: unknown;
    store
      .carregar({ page: 0, nome: 'Ful', cidadeProfissional: 'Fortaleza', incluirInativos: true })
      .subscribe((r) => (resultado = r));

    const req = http.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('nome')).toBe('Ful');
    expect(req.request.params.get('cidadeProfissional')).toBe('Fortaleza');
    expect(req.request.params.get('incluirInativos')).toBe('true');
    expect(req.request.params.has('cpf')).toBe(false);
    req.flush({
      conteudo: [advogado],
      pagina: 0,
      tamanho: 10,
      total_elementos: 1,
      total_paginas: 1,
      ultima: true,
    });

    expect((resultado as AdvogadoApi[]).length).toBe(1);
    expect(store.advogados()).toHaveLength(1);
    expect(store.totalElements()).toBe(1);
    expect(store.buscar(7)?.nome).toBe('Fulano');
  });

  it('carregar sem filtros não manda esses params', () => {
    store.carregar({ page: 0, incluirInativos: false }).subscribe();

    const req = http.expectOne((r) => r.url === BASE);
    expect(req.request.params.has('nome')).toBe(false);
    expect(req.request.params.has('incluirInativos')).toBe(false);
    req.flush({ conteudo: [], pagina: 0, tamanho: 10, total_elementos: 0, total_paginas: 1, ultima: true });
  });

  it('alternarFavorito atualiza otimista e desfaz se o backend falhar', () => {
    store.carregar({ page: 0, incluirInativos: false }).subscribe();
    http.expectOne((r) => r.url === BASE).flush({
      conteudo: [advogado],
      pagina: 0,
      tamanho: 10,
      total_elementos: 1,
      total_paginas: 1,
      ultima: true,
    });

    const desejado = store.alternarFavorito(7);
    expect(desejado).toBe(true);
    expect(store.buscar(7)?.favorito).toBe(true);

    const req = http.expectOne(`${environment.apiBaseUrl}/advogados/7/favorito`);
    expect(req.request.body).toEqual({ favorito: true });
    req.flush(null, { status: 500, statusText: 'Server Error' });

    expect(store.buscar(7)?.favorito).toBe(false);
  });

  it('alternarFavorito devolve null quando o advogado não está carregado', () => {
    expect(store.alternarFavorito(999)).toBeNull();
  });
});
