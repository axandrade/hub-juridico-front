import { maskCpf, onlyDigits } from '../../../core/auth/cpf';
import {
  EstadoCivil,
  IPessoa,
  IDossie,
  IEndereco,
  IRepresentanteLegal,
  StatusCliente,
  emptyDossie,
  emptyEndereco,
} from '../../../core/models';
import {
  AtualizarPessoaApi,
  CriarPessoaApi,
  DadosAdministrativosApi,
  EnderecoApi,
  PessoaRespApi,
  RepresentanteApi,
  RepresentanteRespApi,
  StatusVinculoApi,
} from './pessoa-api.model';

/** Status do vínculo: `ATIVO`/`INATIVO` no backend, `active`/`inactive` no dossiê. */
export function statusVinculoFromApi(status: StatusVinculoApi | null): StatusCliente {
  return status === 'INATIVO' ? 'inactive' : 'active';
}

export function statusClienteToApi(status: StatusCliente): StatusVinculoApi {
  return status === 'inactive' ? 'INATIVO' : 'ATIVO';
}

/**
 * Conversão entre `IPessoa` (frontend) e os DTOs da API `/pessoas`.
 *
 * Lacunas conhecidas (sem campo no backend hoje): `pessoa.profissao`,
 * `dossier.folder`. O `dossier.hiringMode` não é enviado porque o enum
 * `modalidade` do backend (CLT/PJ/...) trata de vínculo trabalhista, não de
 * honorários. `dossier.progressEntry` ↔ `registro_andamento` e
 * `dossier.progressHistory` ↔ `historico_andamentos` (andamentos vêm na raiz do
 * response; vão dentro de `dados_administrativos` na requisição).
 * `favorite` vem do `favorito` do response (por usuário) e é alterado via
 * `PATCH /pessoas/{id}/favorito` — nunca no corpo de criar/atualizar.
 *
 * "Cadastrado por": uso `cadastrado_por_nome` do backend; se vier vazio, resolvo
 * pelo usuário logado quando o id bate, senão mostro `Usuário #<id>`.
 */

/** Shape mínimo do usuário logado (compatível com `AuthUser`). */
export interface CurrentUser {
  id: number;
  name: string;
}

// ===================== Response -> IPessoa =====================

export function pessoaRespToClient(res: PessoaRespApi, currentUser: CurrentUser | null): IPessoa {
  const adm = res.dados_administrativos;
  return {
    id: res.id,
    registeredAt: adm?.criado_em ? new Date(adm.criado_em) : new Date(),
    favorite: res.favorito ?? false,
    pessoa: {
      tipo: res.tipo,
      endereco: enderecoFromApi(res.endereco),
      emails: principalPrimeiro(
        (res.emails ?? []).map((e) => ({ endereco: e.endereco, principal: e.principal })),
      ),
      contatos: principalPrimeiro(
        (res.contatos ?? []).map((c) => ({ valor: c.valor, tipo: c.tipo, principal: c.principal })),
      ),
      nome: res.nome ?? '',
      cpf: maskCpf(res.cpf ?? ''),
      rg: res.rg ?? '',
      profissao: '',
      nacionalidade: res.nacionalidade ?? '',
      estadoCivil: (res.estado_civil ?? '') as EstadoCivil | '',
      razaoSocial: res.razao_social ?? '',
      nomeFantasia: res.nome_fantasia ?? '',
      cnpj: res.cnpj ?? '',
      inscricaoEstadual: res.inscricao_estadual ?? '',
      inscricaoMunicipal: res.inscricao_municipal ?? '',
      representantes: (res.representantes ?? []).map(representanteFromApi),
    },
    dossier: {
      ...emptyDossie(),
      file: adm?.caminho_arquivo ?? '',
      status: statusVinculoFromApi(adm?.status ?? null),
      hiringMode: '',
      contractNumber: adm?.numero_contrato ?? '',
      contractDate: adm?.data_contrato ?? '',
      referredBy: adm?.indicado_por ?? '',
      internalOwner: adm?.responsavel_interno ?? '',
      registeredBy:
        adm?.cadastrado_por_nome?.trim() ||
        resolveCadastradoPor(adm?.cadastrado_por_id, currentUser),
      notes: adm?.observacoes ?? '',
      // Andamentos vêm na raiz do `PessoaResponse`, não em `dados_administrativos`.
      progressEntry: res.registro_andamento ?? '',
      progressHistory: res.historico_andamentos ?? '',
    },
  };
}

function resolveCadastradoPor(
  id: number | null | undefined,
  currentUser: CurrentUser | null,
): string {
  if (id == null) {
    return '';
  }
  if (currentUser && currentUser.id === id) {
    return currentUser.name;
  }
  return `Usuário #${id}`;
}

function enderecoFromApi(e: EnderecoApi | null): IEndereco {
  if (!e) {
    return emptyEndereco();
  }
  return {
    logradouro: e.logradouro ?? '',
    numero: e.numero ?? '',
    complemento: e.complemento ?? '',
    bairro: e.bairro ?? '',
    cidade: e.cidade ?? '',
    cep: e.cep ?? '',
    uf: e.uf ?? '',
  };
}

function representanteFromApi(r: RepresentanteRespApi): IRepresentanteLegal {
  return {
    nome: r.nome ?? '',
    cpf: maskCpf(r.cpf ?? ''),
    cargo: r.cargo ?? '',
    endereco: enderecoFromApi(r.endereco),
    emails: principalPrimeiro(
      (r.emails ?? []).map((e) => ({ endereco: e.endereco, principal: e.principal })),
    ),
    contatos: principalPrimeiro(
      (r.contatos ?? []).map((c) => ({ valor: c.valor, tipo: c.tipo, principal: c.principal })),
    ),
  };
}

/** Ordena com o item `principal` no topo; `Array.sort` é estável, então o resto mantém a ordem. */
function principalPrimeiro<T extends { principal: boolean }>(items: T[]): T[] {
  return [...items].sort((a, b) => Number(b.principal) - Number(a.principal));
}

// ===================== IPessoa -> Request =====================

export function clientToCriarRequest(client: IPessoa): CriarPessoaApi {
  const p = client.pessoa;
  const comum = comumRequest(client);

  if (p.tipo === 'FISICA') {
    return {
      tipo: 'FISICA',
      nome: p.nome.trim(),
      cpf: onlyDigits(p.cpf),
      rg: nullif(p.rg),
      estado_civil: p.estadoCivil || null,
      nacionalidade: nullif(p.nacionalidade),
      ...comum,
    };
  }

  return {
    tipo: 'JURIDICA',
    razao_social: p.razaoSocial.trim(),
    nome_fantasia: nullif(p.nomeFantasia),
    cnpj: onlyDigits(p.cnpj),
    inscricao_estadual: nullif(p.inscricaoEstadual),
    inscricao_municipal: nullif(p.inscricaoMunicipal),
    representantes: p.representantes.map(representanteToApi),
    ...comum,
  };
}

export function clientToAtualizarRequest(client: IPessoa): AtualizarPessoaApi {
  const req = clientToCriarRequest(client);
  if (req.tipo === 'FISICA') {
    const { cpf: _cpf, ...rest } = req;
    return rest;
  }
  const { cnpj: _cnpj, ...rest } = req;
  return rest;
}

function comumRequest(client: IPessoa) {
  const p = client.pessoa;
  return {
    endereco: enderecoToApi(p.endereco),
    contatos: p.contatos
      .filter((c) => c.valor.trim())
      .map((c) => ({ valor: c.valor.trim(), tipo: c.tipo, principal: c.principal })),
    emails: p.emails
      .filter((e) => e.endereco.trim())
      .map((e) => ({ endereco: e.endereco.trim(), principal: e.principal })),
    dados_administrativos: dadosAdmFromDossier(client.dossier),
  };
}

/** Mínimo válido: `numero_contrato` e `responsavel_interno` são `@NotBlank` no backend. */
function dadosAdmFromDossier(d: IDossie): DadosAdministrativosApi {
  return {
    status: statusClienteToApi(d.status),
    modalidade: null,
    numero_contrato: d.contractNumber.trim() || '-',
    data_contrato: toIsoDate(d.contractDate),
    responsavel_interno: d.internalOwner.trim() || d.registeredBy.trim() || 'Lincoln',
    indicado_por: nullif(d.referredBy),
    observacoes: nullif(d.notes),
    caminho_arquivo: nullif(d.file),
    registro_andamento: nullif(d.progressEntry),
    historico_andamentos: nullif(d.progressHistory),
  };
}

function enderecoToApi(e: IEndereco): EnderecoApi | null {
  const preenchido = [e.logradouro, e.numero, e.complemento, e.bairro, e.cidade, e.cep, e.uf].some(
    (v) => v.trim(),
  );

  if (!preenchido) {
    return null;
  }
  return {
    logradouro: nullif(e.logradouro),
    numero: nullif(e.numero),
    complemento: nullif(e.complemento),
    bairro: nullif(e.bairro),
    cidade: nullif(e.cidade),
    cep: nullif(e.cep),
    uf: nullif(e.uf),
  };
}

function representanteToApi(r: IRepresentanteLegal): RepresentanteApi {
  return {
    nome: r.nome.trim(),
    cpf: onlyDigits(r.cpf),
    cargo: nullif(r.cargo),
    endereco: enderecoToApi(r.endereco),
    contatos: r.contatos
      .filter((c) => c.valor.trim())
      .map((c) => ({ valor: c.valor.trim(), tipo: c.tipo, principal: c.principal })),
    emails: r.emails
      .filter((e) => e.endereco.trim())
      .map((e) => ({ endereco: e.endereco.trim(), principal: e.principal })),
  };
}

function nullif(value: string): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed ? trimmed : null;
}

/** Aceita `dd/MM/yyyy` ou `yyyy-MM-dd`; qualquer outra coisa vira `null`. */
function toIsoDate(value: string): string | null {
  const s = (value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s;
  }
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return br ? `${br[3]}-${br[2]}-${br[1]}` : null;
}
