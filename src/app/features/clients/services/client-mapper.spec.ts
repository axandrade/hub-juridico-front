import { ClientRespApi } from './client-api.model';
import { clientRespToClient } from './client-mapper';

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
            cpf: '11144477735',
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
