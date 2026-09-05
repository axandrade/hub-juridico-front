import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth.service';
import { ClientRespApi } from './client-api.model';
import { ClientStore } from './client-store';

const BASE = `${environment.apiBaseUrl}/pessoas`;

describe('ClientStore', () => {
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

  it('carregar busca a página no backend com tipo/incluirInativos e popula clients()/buscar()', () => {
    let resultado: unknown;
    store.carregar({ page: 0, tipo: 'FISICA', incluirInativos: true }).subscribe((r) => (resultado = r));

    const req = http.expectOne((r) => r.url === BASE);
    expect(req.request.params.get('page')).toBe('0');
    expect(req.request.params.get('tipo')).toBe('FISICA');
    expect(req.request.params.get('incluirInativos')).toBe('true');
    req.flush({
      conteudo: [registro],
      pagina: 0,
      tamanho: 10,
      total_elementos: 1,
      total_paginas: 1,
      ultima: true,
    });

    expect((resultado as unknown[]).length).toBe(1);
    expect(store.clients()).toHaveLength(1);
    expect(store.totalElements()).toBe(1);
    const cliente = store.buscar(42);
    expect(cliente?.pessoa.nome).toBe('Maria');
    expect(cliente?.favorite).toBe(true);
    expect(cliente?.dossier.status).toBe('active');
  });

  it('carregar sem tipo/incluirInativos não manda esses params', () => {
    store.carregar({ page: 0, tipo: null, incluirInativos: false }).subscribe();

    const req = http.expectOne((r) => r.url === BASE);
    expect(req.request.params.has('tipo')).toBe(false);
    expect(req.request.params.has('incluirInativos')).toBe(false);
    req.flush({ conteudo: [], pagina: 0, tamanho: 10, total_elementos: 0, total_paginas: 1, ultima: true });
  });

  it('buscarCompleto busca a ficha inteira em GET /pessoas/{id}', () => {
    let resultado: unknown;
    store.buscarCompleto(42).subscribe((r) => (resultado = r));

    const req = http.expectOne(`${BASE}/42`);
    req.flush(registro);

    expect((resultado as { pessoa: { nome: string } } | null)?.pessoa.nome).toBe('Maria');
  });

  it('buscarCompleto devolve null quando o backend não acha o registro', () => {
    let resultado: unknown;
    store.buscarCompleto(999).subscribe((r) => (resultado = r));

    const req = http.expectOne(`${BASE}/999`);
    req.flush('not found', { status: 404, statusText: 'Not Found' });

    expect(resultado).toBeNull();
  });

  it('alterarStatus manda {ativo: true} pra ATIVO', () => {
    store.carregar({ page: 0, tipo: null, incluirInativos: false }).subscribe();
    http.expectOne((r) => r.url === BASE).flush({
      conteudo: [registro],
      pagina: 0,
      tamanho: 10,
      total_elementos: 1,
      total_paginas: 1,
      ultima: true,
    });

    store.alterarStatus(42, 'ATIVO').subscribe();
    const req = http.expectOne(`${BASE}/42/status`);
    expect(req.request.body).toEqual({ ativo: true });
    req.flush(registro);
  });

  it('alterarStatus manda {ativo: false} pra INATIVO', () => {
    store.alterarStatus(42, 'INATIVO').subscribe();
    const req = http.expectOne(`${BASE}/42/status`);
    expect(req.request.body).toEqual({ ativo: false });
    req.flush(registro);
  });
});
