import { maskCnpj, maskCpf, maskDocumento, onlyDigits } from '../../../core/auth/documentos-br';
import {
  EstadoCivil,
  IPessoa,
  IContato,
  IDossie,
  IEmail,
  IEndereco,
  IRepresentanteLegal,
  StatusCliente,
  TipoContato,
  TipoPessoa,
  emptyDossie,
  emptyEndereco,
} from '../../../core/models';
import {
  AtualizarClientApi,
  ContatoApi,
  CriarClientApi,
  DadosAdministrativosApi,
  EmailApi,
  EnderecoApi,
  ClientRespApi,
  PessoaDomainWriteApi,
  RepresentanteApi,
  RepresentanteRespApi,
  StatusVinculoApi,
} from './client-api.model';

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

export function clientRespToClient(res: ClientRespApi, currentUser: CurrentUser | null): IPessoa {
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
      representantesFinanceiros: (res.representantes_financeiros ?? []).map(representanteFromApi),
      razaoSocial: res.razao_social ?? '',
      nomeFantasia: res.nome_fantasia ?? '',
      cnpj: maskCnpj(res.cnpj ?? ''),
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

// ===================== /domain/pessoa/{id} -> IPessoa =====================

/**
 * Shape cru de `GET /domain/pessoa/{id}` (ddd-noap) — camelCase, nome literal do campo Java
 * (ver `DomainService`), bem diferente do `ClientRespApi` (snake_case, DTO escrito à mão).
 * Usado só pra carregar a ficha completa no painel (`ClientFormComponent`) — igual ao padrão
 * já validado em `AdvogadoFormComponent`. `favorito`/`cadastrado_por_nome` não existem aqui
 * (não são campos literais da entidade): favorito vem de `DomainFavoritoService` à parte;
 * "cadastrado por" cai no fallback de `resolveCadastradoPor` (usuário atual ou `Usuário #id`).
 */
export interface EmailDomain {
  endereco: string;
  principal: boolean;
}

export interface ContatoDomain {
  valor: string;
  tipo: TipoContato;
  principal: boolean;
}

export interface EnderecoDomain {
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  cep?: string;
  uf?: string;
}

export interface RepresentanteDomain {
  id: number;
  nome: string;
  documento: string;
  cargo?: string;
  endereco?: EnderecoDomain;
  emails?: EmailDomain[];
  contatos?: ContatoDomain[];
}

export interface PessoaDomain {
  id: number;
  status?: StatusVinculoApi;
  endereco?: EnderecoDomain;
  emails?: EmailDomain[];
  contatos?: ContatoDomain[];
  numeroContrato?: string;
  dataContrato?: string | null;
  responsavelInterno?: string;
  indicadoPor?: string | null;
  observacoes?: string | null;
  caminhoArquivo?: string | null;
  registroAndamento?: string | null;
  historicoAndamentos?: string | null;
  cadastradoPorId?: number | null;
  criadoEm?: string;
  representantes?: RepresentanteDomain[];
  representantesFinanceiros?: RepresentanteDomain[];
  // PessoaFisica
  nome?: string;
  cpf?: string;
  rg?: string;
  estadoCivil?: EstadoCivil | null;
  nacionalidade?: string;
  // PessoaJuridica
  razaoSocial?: string;
  nomeFantasia?: string;
  cnpj?: string;
  inscricaoEstadual?: string;
  inscricaoMunicipal?: string;
}

/**
 * Também usado direto (não só como prefixo `representantes.*`) pra alimentar o
 * `DomainModelDropdownComponent` de "buscar representante existente" no dialog — ver
 * `REPRESENTANTE_STANDALONE_DOMAIN_FIELDS`.
 */
const REPRESENTANTE_DOMAIN_FIELDS = [
  'id',
  'nome',
  'documento',
  'cargo',
  'endereco.logradouro',
  'endereco.numero',
  'endereco.complemento',
  'endereco.bairro',
  'endereco.cidade',
  'endereco.cep',
  'endereco.uf',
  'emails.endereco',
  'emails.principal',
  'contatos.valor',
  'contatos.tipo',
  'contatos.principal',
];

/** `fields=` pro `DomainModelDropdownComponent` de "buscar representante existente" (dialog). */
export const REPRESENTANTE_STANDALONE_DOMAIN_FIELDS = REPRESENTANTE_DOMAIN_FIELDS.join(',');

/** Passado como `fields=` pro `DomainService.get()` — cobre tudo que o painel usa. */
export const PESSOA_DOMAIN_FIELDS = [
  'id',
  'status',
  'nome',
  'cpf',
  'rg',
  'estadoCivil',
  'nacionalidade',
  'razaoSocial',
  'nomeFantasia',
  'cnpj',
  'inscricaoEstadual',
  'inscricaoMunicipal',
  'endereco.logradouro',
  'endereco.numero',
  'endereco.complemento',
  'endereco.bairro',
  'endereco.cidade',
  'endereco.cep',
  'endereco.uf',
  'emails.endereco',
  'emails.principal',
  'contatos.valor',
  'contatos.tipo',
  'contatos.principal',
  'numeroContrato',
  'dataContrato',
  'responsavelInterno',
  'indicadoPor',
  'observacoes',
  'caminhoArquivo',
  'registroAndamento',
  'historicoAndamentos',
  'cadastradoPorId',
  'criadoEm',
  ...REPRESENTANTE_DOMAIN_FIELDS.map((f) => `representantes.${f}`),
  ...REPRESENTANTE_DOMAIN_FIELDS.map((f) => `representantesFinanceiros.${f}`),
].join(',');

/** `cpf` só existe em `PessoaFisica` — discrimina o tipo igual `clients.component.ts`. */
export function pessoaDomainToClient(
  dom: PessoaDomain,
  favorite: boolean,
  currentUser: CurrentUser | null,
): IPessoa {
  const tipo: TipoPessoa = dom.cpf != null ? 'FISICA' : 'JURIDICA';
  return {
    id: dom.id,
    registeredAt: dom.criadoEm ? new Date(dom.criadoEm) : new Date(),
    favorite,
    pessoa: {
      tipo,
      endereco: enderecoFromDomain(dom.endereco),
      emails: principalPrimeiro(
        (dom.emails ?? []).map((e) => ({ endereco: e.endereco, principal: e.principal })),
      ),
      contatos: principalPrimeiro(
        (dom.contatos ?? []).map((c) => ({ valor: c.valor, tipo: c.tipo, principal: c.principal })),
      ),
      nome: dom.nome ?? '',
      cpf: maskCpf(dom.cpf ?? ''),
      rg: dom.rg ?? '',
      profissao: '',
      nacionalidade: dom.nacionalidade ?? '',
      estadoCivil: (dom.estadoCivil ?? '') as EstadoCivil | '',
      representantesFinanceiros: (dom.representantesFinanceiros ?? []).map(representanteFromDomain),
      razaoSocial: dom.razaoSocial ?? '',
      nomeFantasia: dom.nomeFantasia ?? '',
      cnpj: maskCnpj(dom.cnpj ?? ''),
      inscricaoEstadual: dom.inscricaoEstadual ?? '',
      inscricaoMunicipal: dom.inscricaoMunicipal ?? '',
      representantes: (dom.representantes ?? []).map(representanteFromDomain),
    },
    dossier: {
      ...emptyDossie(),
      file: dom.caminhoArquivo ?? '',
      status: statusVinculoFromApi(dom.status ?? null),
      hiringMode: '',
      contractNumber: dom.numeroContrato ?? '',
      contractDate: dom.dataContrato ?? '',
      referredBy: dom.indicadoPor ?? '',
      internalOwner: dom.responsavelInterno ?? '',
      registeredBy: resolveCadastradoPor(dom.cadastradoPorId, currentUser),
      notes: dom.observacoes ?? '',
      progressEntry: dom.registroAndamento ?? '',
      progressHistory: dom.historicoAndamentos ?? '',
    },
  };
}

function enderecoFromDomain(e: EnderecoDomain | null | undefined): IEndereco {
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

/** Também usado pra converter a escolha do `DomainModelDropdownComponent` no dialog de representante. */
export function representanteFromDomain(r: RepresentanteDomain): IRepresentanteLegal {
  return {
    nome: r.nome ?? '',
    documento: maskDocumento(r.documento ?? ''),
    cargo: r.cargo ?? '',
    endereco: enderecoFromDomain(r.endereco),
    emails: principalPrimeiro(
      (r.emails ?? []).map((e) => ({ endereco: e.endereco, principal: e.principal })),
    ),
    contatos: principalPrimeiro(
      (r.contatos ?? []).map((c) => ({ valor: c.valor, tipo: c.tipo, principal: c.principal })),
    ),
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
    documento: maskDocumento(r.documento ?? ''),
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

export function clientToCriarRequest(client: IPessoa): CriarClientApi {
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
      representantes: p.representantes.map(representanteToApi),
      representantes_financeiros: p.representantesFinanceiros.map(representanteToApi),
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
    representantes_financeiros: p.representantesFinanceiros.map(representanteToApi),
    ...comum,
  };
}

export function clientToAtualizarRequest(client: IPessoa): AtualizarClientApi {
  const req = clientToCriarRequest(client);
  if (req.tipo === 'FISICA') {
    const { cpf: _cpf, ...rest } = req;
    return rest;
  }
  const { cnpj: _cnpj, ...rest } = req;
  return rest;
}

/**
 * Corpo do `POST /domain/pessoa-fisica` / `/domain/pessoa-juridica` (create via `@Create` do
 * ddd-noap — ver `PessoaController`/`Pessoa.criarPessoa`) — mesmos blocos de `clientToCriarRequest`,
 * só que flat (sem `tipo`, sem o wrapper `dados_administrativos`): os campos administrativos vão
 * direto na raiz, porque é isso que bate com os campos de `Pessoa` no bind por reflection.
 */
export function clientToCriarPessoaDomainRequest(client: IPessoa): PessoaDomainWriteApi {
  const p = client.pessoa;
  const comum = {
    endereco: enderecoToApi(p.endereco),
    contatos: contatosToApi(p.contatos),
    emails: emailsToApi(p.emails),
    representantes: p.representantes.map(representanteToApi),
    representantes_financeiros: p.representantesFinanceiros.map(representanteToApi),
    ...dadosAdmFromDossier(client.dossier),
  };

  if (p.tipo === 'FISICA') {
    return {
      nome: p.nome.trim(),
      cpf: onlyDigits(p.cpf),
      rg: nullif(p.rg),
      estado_civil: p.estadoCivil || null,
      nacionalidade: nullif(p.nacionalidade),
      ...comum,
    };
  }

  return {
    razao_social: p.razaoSocial.trim(),
    nome_fantasia: nullif(p.nomeFantasia),
    cnpj: onlyDigits(p.cnpj),
    inscricao_estadual: nullif(p.inscricaoEstadual),
    inscricao_municipal: nullif(p.inscricaoMunicipal),
    ...comum,
  };
}

function contatosToApi(contatos: IContato[]): ContatoApi[] {
  return contatos
    .filter((c) => c.valor.trim())
    .map((c) => ({ valor: c.valor.trim(), tipo: c.tipo, principal: c.principal }));
}

function emailsToApi(emails: IEmail[]): EmailApi[] {
  return emails
    .filter((e) => e.endereco.trim())
    .map((e) => ({ endereco: e.endereco.trim(), principal: e.principal }));
}

function comumRequest(client: IPessoa) {
  const p = client.pessoa;
  return {
    endereco: enderecoToApi(p.endereco),
    contatos: contatosToApi(p.contatos),
    emails: emailsToApi(p.emails),
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
    documento: onlyDigits(r.documento),
    cargo: nullif(r.cargo),
    endereco: enderecoToApi(r.endereco),
    contatos: contatosToApi(r.contatos),
    emails: emailsToApi(r.emails),
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
