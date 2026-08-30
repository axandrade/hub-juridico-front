import { IDadosPessoa, IPessoa, emptyDadosPessoa, emptyDossie } from '../../../core/models';
import { createClientForm, patchClientForm } from './client-form.factory';

function pessoa(dados: Partial<IDadosPessoa>): IPessoa {
  return {
    id: 1,
    registeredAt: new Date('2026-01-01'),
    favorite: false,
    pessoa: { ...emptyDadosPessoa('FISICA'), nome: 'Fulano', cpf: '111', ...dados },
    dossier: { ...emptyDossie() },
  };
}

describe('patchClientForm — emails e contatos', () => {
  it('preenche as duas listas ao carregar a pessoa', () => {
    const form = createClientForm();

    patchClientForm(
      form,
      pessoa({
        emails: [
          { endereco: 'a@x.com', principal: true },
          { endereco: 'b@x.com', principal: false },
        ],
        contatos: [{ valor: '81999', tipo: 'WHATSAPP', principal: true }],
      }),
    );

    expect(form.controls.pessoa.controls.emails.length).toBe(2);
    expect(form.controls.pessoa.controls.contatos.length).toBe(1);
    expect(form.getRawValue().pessoa.emails).toEqual([
      { endereco: 'a@x.com', principal: true },
      { endereco: 'b@x.com', principal: false },
    ]);
    expect(form.getRawValue().pessoa.contatos).toEqual([
      { valor: '81999', tipo: 'WHATSAPP', principal: true },
    ]);
  });

  it('troca a referência dos FormArrays a cada carga (dispara re-render OnPush dos editores)', () => {
    const form = createClientForm();
    const emailsInicial = form.controls.pessoa.controls.emails;

    patchClientForm(form, pessoa({ emails: [{ endereco: 'a@x.com', principal: true }] }));
    const emailsApos1 = form.controls.pessoa.controls.emails;

    patchClientForm(form, pessoa({ emails: [{ endereco: 'c@x.com', principal: true }] }));
    const emailsApos2 = form.controls.pessoa.controls.emails;

    expect(emailsApos1).not.toBe(emailsInicial);
    expect(emailsApos2).not.toBe(emailsApos1);
    expect(form.getRawValue().pessoa.emails).toEqual([{ endereco: 'c@x.com', principal: true }]);
  });

  it('substitui a lista da pessoa anterior — não acumula', () => {
    const form = createClientForm();

    patchClientForm(
      form,
      pessoa({
        emails: [
          { endereco: 'a@x.com', principal: true },
          { endereco: 'b@x.com', principal: false },
        ],
        contatos: [{ valor: '1', tipo: 'TELEFONE', principal: true }],
      }),
    );
    patchClientForm(form, pessoa({ emails: [], contatos: [] }));

    expect(form.controls.pessoa.controls.emails.length).toBe(0);
    expect(form.controls.pessoa.controls.contatos.length).toBe(0);
  });
});
