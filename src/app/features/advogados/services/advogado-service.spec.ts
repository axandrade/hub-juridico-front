import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { AdvogadoApi } from './advogado-api.model';
import { AdvogadoService } from './advogado-service';

const BASE = `${environment.apiBaseUrl}/advogados`;

describe('AdvogadoService', () => {
  let store: AdvogadoService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), AdvogadoService],
    });
    store = TestBed.inject(AdvogadoService);
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
    expect(req.request.params.has('busca')).toBe(false);
    expect(req.request.params.has('incluirInativos')).toBe(false);
    req.flush({ conteudo: [], pagina: 0, tamanho: 10, total_elementos: 0, total_paginas: 1, ultima: true });
  });

  it('carregar manda busca (trim) como query param', () => {
    store.carregar({ page: 0, busca: '  ondaazul ', incluirInativos: false }).subscribe();

    const req = http.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('busca')).toBe('ondaazul');
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

  const editavel = {
    id: 0,
    nome: 'FULANO DE TAL',
    cpf: '11144477735',
    rg: '',
    oab: '12345',
    profissao: '',
    nacionalidade: 'Brasileira',
    estadoCivil: '' as const,
    email: 'fulano@exemplo.com',
    telefoneWhatsapp: '',
    enderecoProfissional: '',
    cepProfissional: '',
    cidadeProfissional: 'Fortaleza',
    observacoes: '',
  };

  it('salvar com id 0 faz POST com nome/cpf e adiciona na lista', () => {
    let resultado: unknown;
    store.salvar(editavel).subscribe((r) => (resultado = r));

    const req = http.expectOne(BASE);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.nome).toBe('FULANO DE TAL');
    expect(req.request.body.cpf).toBe('11144477735');
    expect(req.request.body.cidade_profissional).toBe('Fortaleza');
    req.flush({ ...advogado, id: 50 });

    expect((resultado as AdvogadoApi).id).toBe(50);
    expect(store.buscar(50)?.nome).toBe('Fulano');
  });

  it('salvar com id > 0 faz PUT sem nome/cpf e substitui na lista', () => {
    store.carregar({ page: 0, incluirInativos: false }).subscribe();
    http.expectOne((r) => r.url === BASE).flush({
      conteudo: [advogado],
      pagina: 0,
      tamanho: 10,
      total_elementos: 1,
      total_paginas: 1,
      ultima: true,
    });

    store.salvar({ ...editavel, id: 7, oab: '99999' }).subscribe();

    const req = http.expectOne(`${BASE}/7`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.nome).toBeUndefined();
    expect(req.request.body.cpf).toBeUndefined();
    expect(req.request.body.oab).toBe('99999');
    req.flush({ ...advogado, oab: '99999' });

    expect(store.buscar(7)?.oab).toBe('99999');
  });

  it('alterarStatus manda { ativo: false } e atualiza a lista', () => {
    store.carregar({ page: 0, incluirInativos: false }).subscribe();
    http.expectOne((r) => r.url === BASE).flush({
      conteudo: [advogado],
      pagina: 0,
      tamanho: 10,
      total_elementos: 1,
      total_paginas: 1,
      ultima: true,
    });

    store.alterarStatus(7, false).subscribe();
    const req = http.expectOne(`${BASE}/7/status`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ ativo: false });
    req.flush({ ...advogado, ativo: false });

    expect(store.buscar(7)?.ativo).toBe(false);
  });

  it('buscarCompleto devolve null quando o backend não acha o registro', () => {
    let resultado: unknown = 'inicial';
    store.buscarCompleto(999).subscribe((r) => (resultado = r));
    http.expectOne(`${BASE}/999`).flush('not found', { status: 404, statusText: 'Not Found' });
    expect(resultado).toBeNull();
  });
});
