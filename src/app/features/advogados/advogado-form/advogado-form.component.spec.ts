import { ComponentRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { DomainFavoritoService } from '../../../core/services/domain-favorito.service';
import { DomainService } from '../../../core/services/domain.service';
import { ToastService } from '../../../shared/services/toast.service';
import { AdvogadoDomain } from '../services/advogado-api.model';
import { AdvogadoFormComponent } from './advogado-form.component';

/**
 * Testa direto no componente, sem `advogado-form.factory.ts`/`AdvogadoService` (nenhum dos
 * dois existe mais — form e persistência ficam na própria classe, mesmo padrão do
 * `DataColaboradorComponent` do cev-front, que também não tem spec dedicado). Cobre o que os
 * dois arquivos deletados cobriam: validação do form, patch da ficha carregada e o corpo/verbo
 * exatos mandados pro `DomainService` em cada operação.
 */
function makeAdvogado(over: Partial<AdvogadoDomain> = {}): AdvogadoDomain {
  return {
    id: 7,
    nome: 'Fulano',
    nacionalidade: 'Brasileira',
    estadoCivil: 'CASADO',
    profissao: 'Advogado',
    oab: 'CE 12345',
    cpf: '11144477735',
    rg: '123',
    email: 'fulano@exemplo.com',
    telefoneWhatsapp: '85999',
    enderecoProfissional: 'Rua X, 10',
    cepProfissional: '60000-000',
    cidadeProfissional: 'Fortaleza',
    ativo: true,
    observacoes: 'obs',
    ...over,
  };
}

describe('AdvogadoFormComponent', () => {
  let fixture: ComponentFixture<AdvogadoFormComponent>;
  let ref: ComponentRef<AdvogadoFormComponent>;
  let domainService: { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn>; patch: ReturnType<typeof vi.fn> };
  let domainFavoritoService: {
    listarFavoritos: ReturnType<typeof vi.fn>;
    favoritar: ReturnType<typeof vi.fn>;
    desfavoritar: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    domainService = { get: vi.fn(), post: vi.fn(), patch: vi.fn() };
    domainFavoritoService = {
      listarFavoritos: vi.fn(() => of(new Map())),
      favoritar: vi.fn(),
      desfavoritar: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [AdvogadoFormComponent],
      providers: [
        { provide: DomainService, useValue: domainService },
        { provide: DomainFavoritoService, useValue: domainFavoritoService },
        { provide: ToastService, useValue: { sucesso: vi.fn(), erro: vi.fn(), info: vi.fn() } },
      ],
    });
    fixture = TestBed.createComponent(AdvogadoFormComponent);
    ref = fixture.componentRef;
    ref.setInput('advogadoId', null);
    fixture.detectChanges();
  });

  function form() {
    return (fixture.componentInstance as unknown as { form: AdvogadoFormComponent['form'] }).form;
  }

  it('form novo é inválido sem nome e com e-mail malformado', () => {
    expect(form().controls.nome.valid).toBe(false);

    form().controls.nome.setValue('Fulano');
    form().controls.email.setValue('nao-e-email');
    expect(form().controls.email.valid).toBe(false);

    form().controls.email.setValue('ok@exemplo.com');
    expect(form().valid).toBe(true);
  });

  it('cpf inválido reprova, cpf válido (ou vazio) passa', () => {
    form().controls.cpf.setValue('123');
    expect(form().controls.cpf.valid).toBe(false);

    form().controls.cpf.setValue('111.444.777-35');
    expect(form().controls.cpf.valid).toBe(true);

    form().controls.cpf.setValue('');
    expect(form().controls.cpf.valid).toBe(true);
  });

  it('ao trocar advogadoId, busca via DomainService.get e preenche o form (camelCase), travando nome/cpf', () => {
    domainService.get.mockReturnValue(of(makeAdvogado()));

    ref.setInput('advogadoId', 7);
    fixture.detectChanges();

    expect(domainService.get).toHaveBeenCalledWith({ entityName: 'advogado', entityId: 7 });
    const raw = form().getRawValue();
    expect(raw.nome).toBe('Fulano');
    expect(raw.estadoCivil).toBe('CASADO');
    expect(raw.enderecoProfissional).toBe('Rua X, 10');
    expect(raw.cidadeProfissional).toBe('Fortaleza');
    expect(form().controls.nome.disabled).toBe(true);
    expect(form().controls.cpf.disabled).toBe(true);
  });

  it('estadoCivil nulo vira string vazia no form', () => {
    domainService.get.mockReturnValue(of(makeAdvogado({ estadoCivil: null })));

    ref.setInput('advogadoId', 7);
    fixture.detectChanges();

    expect(form().getRawValue().estadoCivil).toBe('');
  });

  it('buscarCompleto: 404/erro do backend não quebra e não preenche o form', () => {
    domainService.get.mockReturnValue(throwError(() => new Error('not found')));

    ref.setInput('advogadoId', 999);
    fixture.detectChanges();

    expect(form().getRawValue().nome).toBe('');
  });

  it('salvar novo (id 0): POST com nome/cpf no corpo, depois GET pela ficha completa', () => {
    domainService.post.mockReturnValue(of({ id: 50 }));
    domainService.get.mockReturnValue(of(makeAdvogado({ id: 50 })));

    form().controls.nome.setValue('fulano de tal');
    // Dígitos "crus" — é o que o FormControl guarda depois da CpfMaskDirective processar o input.
    form().controls.cpf.setValue('11144477735');
    form().controls.email.setValue('fulano@exemplo.com');

    (fixture.componentInstance as unknown as { save: () => void }).save();

    expect(domainService.post).toHaveBeenCalledTimes(1);
    const command = domainService.post.mock.calls[0][0];
    expect(command.entityName).toBe('advogado');
    expect(command.body.nome).toBe('FULANO DE TAL');
    expect(command.body.cpf).toBe('11144477735');
    expect(domainService.get).toHaveBeenCalledWith({ entityName: 'advogado', entityId: 50 });
  });

  it('salvar existente (id > 0): PATCH sem nome/cpf no corpo, depois GET pela ficha atualizada', () => {
    domainService.get.mockReturnValue(of(makeAdvogado({ id: 7 })));
    ref.setInput('advogadoId', 7);
    fixture.detectChanges();

    domainService.patch.mockReturnValue(of(undefined));
    domainService.get.mockReturnValue(of(makeAdvogado({ id: 7, oab: '99999' })));
    form().controls.oab.setValue('99999');

    (fixture.componentInstance as unknown as { save: () => void }).save();

    expect(domainService.patch).toHaveBeenCalledTimes(1);
    const command = domainService.patch.mock.calls[0][0];
    expect(command.entityName).toBe('advogado');
    expect(command.entityId).toBe(7);
    expect(command.body.nome).toBeUndefined();
    expect(command.body.cpf).toBeUndefined();
    expect(command.body.oab).toBe('99999');
  });

  it('reativar (estava inativo): PATCH { ativo: true } direto, sem precisar confirmar', () => {
    domainService.get.mockReturnValue(of(makeAdvogado({ id: 7, ativo: false })));
    ref.setInput('advogadoId', 7);
    fixture.detectChanges();

    domainService.patch.mockReturnValue(of(undefined));
    domainService.get.mockReturnValue(of(makeAdvogado({ id: 7, ativo: true })));

    (fixture.componentInstance as unknown as { requestStatusChange: () => void }).requestStatusChange();

    expect(domainService.patch).toHaveBeenCalledWith({ entityName: 'advogado', entityId: 7, body: { ativo: true } });
  });
});
