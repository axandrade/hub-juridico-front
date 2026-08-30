import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, forkJoin } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthUser } from '../auth/auth.models';
import { TokenStore } from '../auth/token-store';
import { AuthService } from './auth.service';

const API = environment.apiBaseUrl;

const USER: AuthUser = {
  id: '1',
  nome: 'Alexsandro Andrade',
  login: 'alexsandro.andrade',
  email: 'a@b.com',
  cpf: '01786978342',
  is_active: true,
  is_staff: true,
  must_change_password: false,
  role: { name: 'ADMIN', permissions: ['*'] },
  created_at: '',
  updated_at: '',
  last_login: null,
};

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;
  let store: TokenStore;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), AuthService, TokenStore],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(TokenStore);
  });

  afterEach(() => http.verify());

  it('começa sem sessão', () => {
    expect(service.isAuthenticated()).toBe(false);
  });

  it('faz login com CPF (só dígitos), guarda o refresh no localStorage e carrega o perfil', async () => {
    const done = firstValueFrom(service.login('017.869.783-42', 'Alex@ndrade2026', true));

    const req = http.expectOne(`${API}/auth/login/`);
    expect(req.request.body).toEqual({ cpf: '01786978342', senha: 'Alex@ndrade2026' });
    req.flush({ access: 'acc-1', refresh: 'ref-1', must_change_password: false });
    http.expectOne(`${API}/auth/me/`).flush(USER);
    await done;

    expect(service.isAuthenticated()).toBe(true);
    expect(service.user()?.login).toBe('alexsandro.andrade');
    expect(localStorage.getItem('hub-juridico.refresh')).toBe('ref-1');
    expect(sessionStorage.getItem('hub-juridico.refresh')).toBeNull();
    expect(store.accessToken).toBe('acc-1');
  });

  it('usa sessionStorage quando "lembrar-me" está desligado', async () => {
    const done = firstValueFrom(service.login('39053344705', 'p', false));
    http
      .expectOne(`${API}/auth/login/`)
      .flush({ access: 'a', refresh: 'r', must_change_password: false });
    http.expectOne(`${API}/auth/me/`).flush(USER);
    await done;

    expect(sessionStorage.getItem('hub-juridico.refresh')).toBe('r');
    expect(localStorage.getItem('hub-juridico.refresh')).toBeNull();
  });

  it('bootstrap sem refresh token não chama a API', async () => {
    await firstValueFrom(service.bootstrap());
    http.expectNone(`${API}/auth/refresh/`);
    expect(service.isAuthenticated()).toBe(false);
  });

  it('bootstrap com refresh token reidrata a sessão', async () => {
    store.setTokens({ access: '', refresh: 'ref-persisted' }, true);

    const done = firstValueFrom(service.bootstrap());
    http.expectOne(`${API}/auth/refresh/`).flush({ access: 'acc-2', refresh: 'ref-2' });
    http.expectOne(`${API}/auth/me/`).flush(USER);
    await done;

    expect(service.isAuthenticated()).toBe(true);
    expect(store.accessToken).toBe('acc-2');
    expect(localStorage.getItem('hub-juridico.refresh')).toBe('ref-2');
  });

  it('refresh é single-flight: chamadas simultâneas geram uma única requisição', async () => {
    store.setTokens({ access: '', refresh: 'ref' }, true);

    const done = firstValueFrom(forkJoin([service.refresh(), service.refresh()]));
    http.expectOne(`${API}/auth/refresh/`).flush({ access: 'acc-x', refresh: 'ref-x' });
    const [a, b] = await done;

    expect(a).toBe('acc-x');
    expect(b).toBe('acc-x');
  });

  it('logout revoga o refresh no servidor e limpa a sessão', async () => {
    store.setTokens({ access: 'acc', refresh: 'ref' }, true);

    const done = firstValueFrom(service.logout());
    const req = http.expectOne(`${API}/auth/logout/`);
    expect(req.request.body).toEqual({ refresh: 'ref' });
    req.flush(null, { status: 204, statusText: 'No Content' });
    await done;

    expect(service.isAuthenticated()).toBe(false);
    expect(store.accessToken).toBeNull();
    expect(localStorage.getItem('hub-juridico.refresh')).toBeNull();
  });

  it('changePassword encerra a sessão ao concluir', async () => {
    store.setTokens({ access: 'acc', refresh: 'ref' }, true);

    const done = firstValueFrom(service.changePassword('atual', 'Nova@Senha1'));
    http.expectOne(`${API}/users/me/change-password/`).flush(null, {
      status: 204,
      statusText: 'No Content',
    });
    await done;

    expect(service.isAuthenticated()).toBe(false);
    expect(store.getRefreshToken()).toBeNull();
  });
});
