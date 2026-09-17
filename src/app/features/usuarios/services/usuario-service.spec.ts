import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { DomainService, IPostServiceMethodCommand } from '../../../core/services/domain.service';
import { UsuarioApi, UsuarioAtualizarApi, UsuarioCriarApi } from './usuario-api.model';
import { UsuarioService } from './usuario-service';

/**
 * Cobre o formato do corpo que `UsuarioService` monta pro `POST
 * /domain/service/user-service/{método}` (ddd-noap) — migrado de `/api/v1/users` (removido
 * junto com `UserController`). O que importa aqui é `args` casar com os nomes reais dos
 * parâmetros de `UserService` (Java, compilado com `-parameters`): `request` pro DTO,
 * `id`/`ativo` soltos, e `nova_senha` (snake_case) dentro do `request` de `redefinirSenha`
 * (único parâmetro composto — os demais campos usados aqui são todos de uma palavra só, então
 * snake_case e camelCase coincidem por acaso).
 */
describe('UsuarioService — corpo do POST /domain/service/user-service/{método}', () => {
  let service: UsuarioService;
  let lastCommand: IPostServiceMethodCommand | undefined;

  const respostaUsuario: UsuarioApi = {
    id: 1,
    cpf: '111.444.777-35',
    email: 'a@x.com',
    name: 'Fulano',
    role: 'USER',
    status: 'ACTIVE',
    ativo: true,
    must_change_password: true,
    last_login_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  const domainStore = {
    postServiceMethod: (command: IPostServiceMethodCommand) => {
      lastCommand = command;
      return of(respostaUsuario);
    },
  };

  beforeEach(() => {
    lastCommand = undefined;
    TestBed.configureTestingModule({
      providers: [UsuarioService, { provide: DomainService, useValue: domainStore }],
    });
    service = TestBed.inject(UsuarioService);
  });

  it('criar: serviceName/method certos, args.request com o corpo inteiro', () => {
    const body: UsuarioCriarApi = {
      cpf: '11144477735',
      email: 'a@x.com',
      name: 'Fulano',
      role: 'USER',
      senha: 'senha123!',
    };

    service.criar(body).subscribe();

    expect(lastCommand?.serviceName).toBe('user-service');
    expect(lastCommand?.method).toBe('criar');
    expect(lastCommand?.args).toEqual({ request: body });
  });

  it('atualizar: args.id solto e args.request com o corpo', () => {
    const body: UsuarioAtualizarApi = { email: 'a@x.com', name: 'Fulano', role: 'ADMIN' };

    service.atualizar(7, body).subscribe();

    expect(lastCommand?.method).toBe('atualizar');
    expect(lastCommand?.args).toEqual({ id: 7, request: body });
  });

  it('alterarStatus: args.id e args.ativo soltos, sem id de admin nenhum (vem do Context no backend)', () => {
    service.alterarStatus(7, false).subscribe();

    expect(lastCommand?.method).toBe('alterar-status');
    expect(lastCommand?.args).toEqual({ id: 7, ativo: false });
  });

  it('redefinirSenha: args.request.nova_senha em snake_case (único parâmetro composto)', () => {
    service.redefinirSenha(7, 'novaSenha123!').subscribe();

    expect(lastCommand?.method).toBe('redefinir-senha');
    expect(lastCommand?.args).toEqual({ id: 7, request: { nova_senha: 'novaSenha123!' } });
  });
});
