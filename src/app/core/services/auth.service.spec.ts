import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { AUTH_DEMO } from '../constants/app-constants';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [AuthService] });
    service = TestBed.inject(AuthService);
  });

  it('começa sem sessão', () => {
    expect(service.isAuthenticated()).toBe(false);
    expect(service.user()).toBeNull();
  });

  it('autentica com as credenciais de demonstração e persiste a sessão', async () => {
    const user = await firstValueFrom(
      service.login(AUTH_DEMO.USERNAME, AUTH_DEMO.PASSWORD, true),
    );

    expect(user.username).toBe(AUTH_DEMO.USERNAME);
    expect(service.isAuthenticated()).toBe(true);
    expect(localStorage.getItem(AUTH_DEMO.STORAGE_KEY)).not.toBeNull();
  });

  it('rejeita credenciais inválidas', async () => {
    await expect(firstValueFrom(service.login('admin', 'errada'))).rejects.toThrow(
      /inválidos/i,
    );
    expect(service.isAuthenticated()).toBe(false);
  });

  it('usa sessionStorage quando "lembrar-me" está desligado', async () => {
    await firstValueFrom(service.login(AUTH_DEMO.USERNAME, AUTH_DEMO.PASSWORD, false));

    expect(sessionStorage.getItem(AUTH_DEMO.STORAGE_KEY)).not.toBeNull();
    expect(localStorage.getItem(AUTH_DEMO.STORAGE_KEY)).toBeNull();
  });

  it('encerra a sessão no logout', async () => {
    await firstValueFrom(service.login(AUTH_DEMO.USERNAME, AUTH_DEMO.PASSWORD, true));
    service.logout();

    expect(service.isAuthenticated()).toBe(false);
    expect(localStorage.getItem(AUTH_DEMO.STORAGE_KEY)).toBeNull();
  });
});
