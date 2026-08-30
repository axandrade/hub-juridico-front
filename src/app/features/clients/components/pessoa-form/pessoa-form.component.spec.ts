import { ComponentRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';

import { IPessoa, emptyDadosPessoa, emptyDossie } from '../../../../core/models';
import { AuthService } from '../../../../core/services/auth.service';
import { PessoaStore } from '../../services/pessoa-store';
import { PessoaFormComponent } from './pessoa-form.component';

function makePessoa(over: Partial<IPessoa> = {}): IPessoa {
  return {
    id: 7,
    registeredAt: new Date('2026-02-02'),
    favorite: false,
    pessoa: {
      ...emptyDadosPessoa('FISICA'),
      nome: 'MARIA SOUZA',
      cpf: '111.444.777-35',
      emails: [{ endereco: 'maria@x.com', principal: true }],
      contatos: [{ valor: '81999', tipo: 'WHATSAPP', principal: true }],
    },
    dossier: { ...emptyDossie(), folder: 'Pasta - 000007 - MARIA SOUZA' },
    ...over,
  };
}

describe('PessoaFormComponent — carregar ficha ao trocar pessoaId', () => {
  let fixture: ComponentFixture<PessoaFormComponent>;
  let ref: ComponentRef<PessoaFormComponent>;
  const store = {
    buscar: (id: number | null) => (id === 7 ? makePessoa() : null),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PessoaFormComponent],
      providers: [
        provideHttpClient(),
        { provide: PessoaStore, useValue: store },
        { provide: AuthService, useValue: { user: () => ({ id: 1, name: 'Tester', role: 'admin' }) } },
      ],
    });
    fixture = TestBed.createComponent(PessoaFormComponent);
    ref = fixture.componentRef;
    ref.setInput('pessoaId', null);
    fixture.detectChanges();
  });

  it('preenche o form com os dados da pessoa quando pessoaId muda', () => {
    ref.setInput('pessoaId', 7);
    fixture.detectChanges();

    const raw = (fixture.componentInstance as unknown as { form: PessoaFormComponent['form'] }).form.getRawValue();
    expect(raw.pessoa.nome).toBe('MARIA SOUZA');
    expect(raw.pessoa.emails).toEqual([{ endereco: 'maria@x.com', principal: true }]);
    expect(raw.dossier.folder).toBe('Pasta - 000007 - MARIA SOUZA');
  });

  it('reflete o nome no <input> renderizado da aba Dados pessoais', () => {
    ref.setInput('pessoaId', 7);
    fixture.detectChanges();

    const inputs = fixture.nativeElement.querySelectorAll('input') as NodeListOf<HTMLInputElement>;
    const values = Array.from(inputs).map((i) => i.value);
    expect(values).toContain('MARIA SOUZA');
  });
});
