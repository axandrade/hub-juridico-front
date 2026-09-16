import { ComponentRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { of } from 'rxjs';

import { AuthService } from '../../../../core/services/auth.service';
import { DomainFavoritoService } from '../../../../core/services/domain-favorito.service';
import { DomainService } from '../../../../core/services/domain.service';
import { PessoaDomain } from '../../services/client-mapper';
import { ClientFormComponent } from './client-form.component';

/** Shape cru de `/domain/pessoa/{id}` (ver `client-mapper.ts`) — não `IPessoa` direto. */
function makePessoaDomain(): PessoaDomain {
  return {
    id: 7,
    status: 'ATIVO',
    nome: 'MARIA SOUZA',
    cpf: '11144477735',
    emails: [{ endereco: 'maria@x.com', principal: true }],
    contatos: [{ valor: '81999', tipo: 'WHATSAPP', principal: true }],
  };
}

describe('ClientFormComponent — carregar ficha ao trocar pessoaId', () => {
  let fixture: ComponentFixture<ClientFormComponent>;
  let ref: ComponentRef<ClientFormComponent>;
  const domainStore = {
    get: (command: { entityId?: string | number }) =>
      of(command.entityId === 7 ? makePessoaDomain() : null),
  };
  const domainFavoritoStore = {
    listarFavoritos: () => of(new Map<number, number>()),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ClientFormComponent],
      providers: [
        provideHttpClient(),
        { provide: DomainService, useValue: domainStore },
        { provide: DomainFavoritoService, useValue: domainFavoritoStore },
        { provide: AuthService, useValue: { user: () => ({ id: 1, name: 'Tester', role: 'admin' }) } },
      ],
    });
    fixture = TestBed.createComponent(ClientFormComponent);
    ref = fixture.componentRef;
    ref.setInput('pessoaId', null);
    fixture.detectChanges();
  });

  it('preenche o form com os dados da pessoa quando pessoaId muda', () => {
    ref.setInput('pessoaId', 7);
    fixture.detectChanges();

    const raw = (fixture.componentInstance as unknown as { form: ClientFormComponent['form'] }).form.getRawValue();
    expect(raw.pessoa.nome).toBe('MARIA SOUZA');
    expect(raw.pessoa.emails).toEqual([{ endereco: 'maria@x.com', principal: true }]);
  });

  it('reflete o nome no <input> renderizado da aba Dados pessoais', () => {
    ref.setInput('pessoaId', 7);
    fixture.detectChanges();

    const inputs = fixture.nativeElement.querySelectorAll('input') as NodeListOf<HTMLInputElement>;
    const values = Array.from(inputs).map((i) => i.value);
    expect(values).toContain('MARIA SOUZA');
  });
});
