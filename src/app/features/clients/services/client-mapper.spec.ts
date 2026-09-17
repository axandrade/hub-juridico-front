import { IPessoa, emptyDadosPessoa, emptyDossie, emptyEndereco } from '../../../core/models';
import { ClientRespApi } from './client-api.model';
import { clientRespToClient, clientToCriarPessoaDomainRequest } from './client-mapper';

function resp(over: Partial<ClientRespApi> = {}): ClientRespApi {
  return {
    tipo: 'FISICA',
    id: 1,
    nome: 'Fulano',
    cpf: '11144477735',
    favorito: false,
    endereco: null,
    contatos: [],
    emails: [],
    dados_administrativos: {
      status: 'ATIVO',
      modalidade: null,
      numero_contrato: '-',
      data_contrato: null,
      responsavel_interno: 'Resp',
      indicado_por: null,
      observacoes: null,
      caminho_arquivo: null,
      cadastrado_por_id: null,
      cadastrado_por_nome: null,
      criado_em: null,
      atualizado_em: null,
    },
    ...over,
  };
}

describe('clientRespToClient — principal no topo', () => {
  it('põe o e-mail principal em primeiro, preservando a ordem dos demais', () => {
    const client = clientRespToClient(
      resp({
        emails: [
          { endereco: 'a@x.com', principal: false },
          { endereco: 'b@x.com', principal: true },
          { endereco: 'c@x.com', principal: false },
        ],
      }),
      null,
    );

    expect(client.pessoa.emails.map((e) => e.endereco)).toEqual([
      'b@x.com',
      'a@x.com',
      'c@x.com',
    ]);
    expect(client.pessoa.emails[0].principal).toBe(true);
  });

  it('põe o contato principal em primeiro', () => {
    const client = clientRespToClient(
      resp({
        contatos: [
          { valor: '1111', tipo: 'TELEFONE', principal: false },
          { valor: '2222', tipo: 'TELEFONE', principal: true },
          { valor: '3333', tipo: 'WHATSAPP', principal: false },
        ],
      }),
      null,
    );

    expect(client.pessoa.contatos.map((c) => c.valor)).toEqual(['2222', '1111', '3333']);
  });

  it('sem principal, mantém a ordem original', () => {
    const client = clientRespToClient(
      resp({
        emails: [
          { endereco: 'a@x.com', principal: false },
          { endereco: 'b@x.com', principal: false },
        ],
      }),
      null,
    );

    expect(client.pessoa.emails.map((e) => e.endereco)).toEqual(['a@x.com', 'b@x.com']);
  });

  it('ordena também as listas dos representantes legais', () => {
    const client = clientRespToClient(
      resp({
        tipo: 'JURIDICA',
        razao_social: 'ACME',
        cnpj: '11222333000181',
        representantes: [
          {
            id: 9,
            nome: 'Rep',
            documento: '11144477735',
            cargo: null,
            endereco: null,
            emails: [
              { endereco: 'sec@x.com', principal: false },
              { endereco: 'chefe@x.com', principal: true },
            ],
            contatos: [],
          },
        ],
      }),
      null,
    );

    expect(client.pessoa.representantes[0].emails[0].endereco).toBe('chefe@x.com');
  });
});

/** Fixture mínima de `IPessoa` física com emails/contatos/representantes preenchidos. */
function clientFisicaComRelacionamentos(): IPessoa {
  return {
    id: 0,
    registeredAt: new Date(),
    favorite: false,
    pessoa: {
      ...emptyDadosPessoa('FISICA'),
      nome: 'Fulano de Tal',
      cpf: '11144477735',
      emails: [
        { endereco: '  a@x.com  ', principal: true },
        { endereco: '   ', principal: false }, // em branco: deve ser filtrado
        { endereco: 'b@x.com', principal: false },
      ],
      contatos: [
        { valor: '81999990000', tipo: 'WHATSAPP', principal: true },
        { valor: '  ', tipo: 'TELEFONE', principal: false }, // em branco: deve ser filtrado
      ],
      representantes: [
        {
          nome: '  representante legal  ',
          documento: '111.444.777-35',
          cargo: 'Sócio',
          endereco: emptyEndereco(),
          emails: [{ endereco: 'rep.legal@x.com', principal: true }],
          contatos: [{ valor: '81988887777', tipo: 'WHATSAPP', principal: true }],
        },
      ],
      representantesFinanceiros: [
        {
          nome: 'representante financeiro',
          documento: '22255588899',
          cargo: '',
          endereco: emptyEndereco(),
          emails: [],
          contatos: [],
        },
      ],
    },
    dossier: {
      ...emptyDossie(),
      status: 'active',
      contractNumber: '123',
      internalOwner: 'Fulano',
    },
  };
}

describe('clientToCriarPessoaDomainRequest — corpo flat do POST /domain/pessoa-fisica|juridica', () => {
  it('manda emails e contatos preenchidos, filtrando os em branco', () => {
    const body = clientToCriarPessoaDomainRequest(clientFisicaComRelacionamentos());

    expect(body.emails).toEqual([
      { endereco: 'a@x.com', principal: true },
      { endereco: 'b@x.com', principal: false },
    ]);
    expect(body.contatos).toEqual([{ valor: '81999990000', tipo: 'WHATSAPP', principal: true }]);
  });

  it('manda representantes e representantes_financeiros com os dados aninhados', () => {
    const body = clientToCriarPessoaDomainRequest(clientFisicaComRelacionamentos());

    expect(body.representantes).toEqual([
      {
        nome: 'representante legal',
        documento: '11144477735',
        cargo: 'Sócio',
        endereco: null,
        emails: [{ endereco: 'rep.legal@x.com', principal: true }],
        contatos: [{ valor: '81988887777', tipo: 'WHATSAPP', principal: true }],
      },
    ]);
    expect(body.representantes_financeiros).toEqual([
      {
        nome: 'representante financeiro',
        documento: '22255588899',
        cargo: null,
        endereco: null,
        emails: [],
        contatos: [],
      },
    ]);
  });

  it('é flat: sem `tipo` e sem o wrapper `dados_administrativos` (os campos administrativos vão na raiz)', () => {
    const body = clientToCriarPessoaDomainRequest(clientFisicaComRelacionamentos()) as unknown as Record<
      string,
      unknown
    >;

    expect(body['tipo']).toBeUndefined();
    expect(body['dados_administrativos']).toBeUndefined();
    expect(body['numero_contrato']).toBe('123');
    expect(body['responsavel_interno']).toBe('Fulano');
    expect(body['status']).toBe('ATIVO');
  });

  it('não manda `cadastrado_por_id` — quem preenche é o @Create no backend', () => {
    const body = clientToCriarPessoaDomainRequest(clientFisicaComRelacionamentos()) as unknown as Record<
      string,
      unknown
    >;

    expect(body['cadastrado_por_id']).toBeUndefined();
  });

  it('pessoa jurídica manda razao_social/cnpj em vez de nome/cpf', () => {
    const client = clientFisicaComRelacionamentos();
    client.pessoa = {
      ...client.pessoa,
      tipo: 'JURIDICA',
      razaoSocial: 'ACME LTDA',
      cnpj: '11222333000181',
    };

    const body = clientToCriarPessoaDomainRequest(client) as unknown as Record<string, unknown>;

    expect(body['razao_social']).toBe('ACME LTDA');
    expect(body['cnpj']).toBe('11222333000181');
    expect(body['nome']).toBeUndefined();
    expect(body['cpf']).toBeUndefined();
  });
});

describe('clientRespToClient — máscara de documento', () => {
  it('mascara o CPF', () => {
    const client = clientRespToClient(resp({ cpf: '11144477735' }), null);
    expect(client.pessoa.cpf).toBe('111.444.777-35');
  });

  it('mascara o CNPJ', () => {
    const client = clientRespToClient(
      resp({ tipo: 'JURIDICA', razao_social: 'ACME', cnpj: '11222333000181' }),
      null,
    );
    expect(client.pessoa.cnpj).toBe('11.222.333/0001-81');
  });
});
