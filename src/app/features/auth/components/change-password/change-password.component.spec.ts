import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { environment } from '../../../../../environments/environment';
import { TokenStore } from '../../../../core/auth/token-store';
import { ChangePasswordComponent } from './change-password.component';

const API = environment.apiBaseUrl;

describe('ChangePasswordComponent', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<ChangePasswordComponent>>;
  let component: ChangePasswordComponent;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      imports: [ChangePasswordComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]), TokenStore],
    });
    TestBed.inject(TokenStore).setTokens({ access: 'a', refresh: 'r' }, true);
    fixture = TestBed.createComponent(ChangePasswordComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('form inválido com senha fraca', () => {
    component['form'].setValue({ senhaAtual: 'x', novaSenha: 'fraca', confirmar: 'fraca' });
    expect(component['form'].controls.novaSenha.hasError('weakPassword')).toBe(true);
    expect(component['form'].invalid).toBe(true);
  });

  it('marca erro quando a confirmação não bate', () => {
    component['form'].setValue({
      senhaAtual: 'atual',
      novaSenha: 'Nova@Senha1',
      confirmar: 'Outra@Senha1',
    });
    expect(component['form'].hasError('passwordsMismatch')).toBe(true);
  });

  it('envia a troca e redireciona para o login ao concluir', async () => {
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component['form'].setValue({
      senhaAtual: 'atual',
      novaSenha: 'Nova@Senha123',
      confirmar: 'Nova@Senha123',
    });
    expect(component['form'].valid).toBe(true);

    component['submit']();

    const req = httpMock.expectOne(`${API}/auth/change-password`);
    expect(req.request.body).toEqual({ current_password: 'atual', new_password: 'Nova@Senha123' });
    req.flush(null, { status: 204, statusText: 'No Content' });
    await Promise.resolve();

    expect(navigateSpy).toHaveBeenCalledWith(['/login'], { queryParams: { trocaOk: '1' } });
  });
});
