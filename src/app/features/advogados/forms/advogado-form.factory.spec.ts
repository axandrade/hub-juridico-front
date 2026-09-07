import { AdvogadoApi } from '../services/advogado-api.model';
import { createAdvogadoForm, patchAdvogadoForm, readAdvogadoForm } from './advogado-form.factory';

const advogado: AdvogadoApi = {
  id: 7,
  favorito: false,
  nome: 'Fulano',
  nacionalidade: 'Brasileira',
  estado_civil: 'CASADO',
  profissao: 'Advogado',
  oab: 'CE 12345',
  cpf: '11144477735',
  rg: '123',
  email: 'fulano@exemplo.com',
  telefone_whatsapp: '85999',
  endereco_profissional: 'Rua X, 10',
  cep_profissional: '60000-000',
  cidade_profissional: 'Fortaleza',
  ativo: true,
  observacoes: 'obs',
};

describe('advogado-form.factory', () => {
  it('form novo é inválido sem nome e com e-mail malformado', () => {
    const form = createAdvogadoForm();
    expect(form.controls.nome.valid).toBe(false);

    form.controls.nome.setValue('Fulano');
    form.controls.email.setValue('nao-e-email');
    expect(form.controls.email.valid).toBe(false);

    form.controls.email.setValue('ok@exemplo.com');
    expect(form.valid).toBe(true);
  });

  it('cpf inválido reprova, cpf válido (ou vazio) passa', () => {
    const form = createAdvogadoForm();
    form.controls.cpf.setValue('123');
    expect(form.controls.cpf.valid).toBe(false);

    form.controls.cpf.setValue('111.444.777-35');
    expect(form.controls.cpf.valid).toBe(true);

    form.controls.cpf.setValue('');
    expect(form.controls.cpf.valid).toBe(true);
  });

  it('patchAdvogadoForm preenche todos os campos e readAdvogadoForm devolve camelCase', () => {
    const form = createAdvogadoForm();
    patchAdvogadoForm(form, advogado);

    expect(form.pristine).toBe(true);
    const lido = readAdvogadoForm(form);
    expect(lido.nome).toBe('Fulano');
    expect(lido.estadoCivil).toBe('CASADO');
    expect(lido.enderecoProfissional).toBe('Rua X, 10');
    expect(lido.cidadeProfissional).toBe('Fortaleza');
  });

  it('readAdvogadoForm mapeia estado_civil nulo para string vazia', () => {
    const form = createAdvogadoForm();
    patchAdvogadoForm(form, { ...advogado, estado_civil: null });
    expect(readAdvogadoForm(form).estadoCivil).toBe('');
  });
});
