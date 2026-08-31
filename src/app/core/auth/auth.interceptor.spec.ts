import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { environment } from '../../../environments/environment';
import { AuthTokensResponse } from '../auth/auth.models';
import { AuthService } from '../services/auth.service';
import { authInterceptor } from './auth.interceptor';
import { TokenStore } from './token-store';

const API = environment.apiBaseUrl;

/** Resposta de `/auth/refresh` no formato do hub-juridico-api. */
function tokens(access: string, refresh: string): AuthTokensResponse {
  return { access_token: access, token_type: 'Bearer', expires_in: 900, refresh_token: refresh };
}

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let store: TokenStore;
  let auth: AuthService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        AuthService,
        TokenStore,
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    store = TestBed.inject(TokenStore);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => httpMock.verify());

  it('anexa o Bearer token nas requisições da API', () => {
    store.setTokens({ access: 'acc-1', refresh: 'ref-1' }, true);

    http.get(`${API}/tasks/`).subscribe();

    const req = httpMock.expectOne(`${API}/tasks/`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer acc-1');
    req.flush([]);
  });

  it('não anexa header nas rotas de login/refresh', () => {
    store.setTokens({ access: 'acc-1', refresh: 'ref-1' }, true);

    http.post(`${API}/auth/login/`, {}).subscribe();
    const req = httpMock.expectOne(`${API}/auth/login/`);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('em 401, renova o token e repete a requisição', async () => {
    store.setTokens({ access: 'stale', refresh: 'ref-1' }, true);

    const result = new Promise((resolve) => http.get(`${API}/tasks/`).subscribe(resolve));

    httpMock
      .expectOne(`${API}/tasks/`)
      .flush(
        { erro: { codigo: 'nao_autenticado', mensagem: 'expirado' } },
        { status: 401, statusText: 'Unauthorized' },
      );

    httpMock.expectOne(`${API}/auth/refresh`).flush(tokens('fresh', 'ref-2'));

    const retry = httpMock.expectOne(`${API}/tasks/`);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer fresh');
    retry.flush([{ id: 't1' }]);

    await expect(result).resolves.toEqual([{ id: 't1' }]);
  });

  it('se o refresh falhar, limpa a sessão e vai para o login', async () => {
    store.setTokens({ access: 'stale', refresh: 'ref-1' }, true);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const clearSpy = vi.spyOn(auth, 'clearSession');

    const result = new Promise((_, reject) =>
      http.get(`${API}/tasks/`).subscribe({ error: reject }),
    );

    httpMock.expectOne(`${API}/tasks/`).flush({}, { status: 401, statusText: 'Unauthorized' });
    httpMock
      .expectOne(`${API}/auth/refresh`)
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    await expect(result).rejects.toBeTruthy();
    expect(clearSpy).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith(['/login'], expect.anything());
  });
});
