import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { AuthService } from '../../../core/services/auth.service';
import { ClientRespApi } from './client-api.model';
import { ClientStore } from './client-store';

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
