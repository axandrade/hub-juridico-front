import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/services/auth.service';
import { ClientRespApi } from './client-api.model';
import { ClientService } from './client-service';

const BASE = `${environment.apiBaseUrl}/pessoas`;

describe('ClientService', () => {
  let store: ClientService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ClientService,
        { provide: AuthService, useValue: { user: () => null } },
      ],
    });
    store = TestBed.inject(ClientService);
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
