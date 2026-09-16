import { EstadoCivil } from '../../../core/models';

/**
 * Ficha de advogado como o `GET /domain/advogado` (ddd-noap) devolve.
 *
 * ATENÇÃO: vem em **camelCase**, ao contrário do resto da API (`/api/v1/**`, que é
 * snake_case via `JacksonConfig`). O backend monta essa resposta por reflection num
 * `Map<String,Object>` usando o nome literal do campo Java — o `PropertyNamingStrategy`
 * do Jackson não se aplica a chave de Map, só a propriedade de bean (ver
 * `DomainService` no core, que documenta a assimetria completa leitura/escrita).
 */
export interface AdvogadoDomain {
  id: number;
  nome: string;
  nacionalidade: string | null;
  estadoCivil: EstadoCivil | null;
  profissao: string | null;
  oab: string | null;
  cpf: string | null;
  rg: string | null;
  email: string | null;
  telefoneWhatsapp: string | null;
  enderecoProfissional: string | null;
  cepProfissional: string | null;
  cidadeProfissional: string | null;
  ativo: boolean;
  observacoes: string | null;
}

/**
 * Corpo enviado ao criar/editar um advogado. `nome`/`cpf` só entram no POST (o backend não
 * impede alterá-los no PATCH — a UI que trava, ver `AdvogadoFormComponent` — mas por
 * convenção só mandamos os dois na criação).
 * snake_case: é assim que `JsonMappingService` desserializa de volta na entidade JPA
 * (bean binding de verdade, respeita o `PropertyNamingStrategy` do Jackson) — ver
 * `DomainService` no core pra assimetria completa com a leitura.
 */
export interface AdvogadoWriteApi {
  nome?: string;
  cpf?: string;
  nacionalidade: string | null;
  estado_civil: EstadoCivil | null;
  profissao: string | null;
  oab: string | null;
  rg: string | null;
  email: string | null;
  telefone_whatsapp: string | null;
  endereco_profissional: string | null;
  cep_profissional: string | null;
  cidade_profissional: string | null;
  observacoes: string | null;
}

/** Campos editáveis de um advogado (camelCase) — o que o formulário produz. */
export interface AdvogadoEditavel {
  id: number;
  nome: string;
  cpf: string;
  rg: string;
  oab: string;
  profissao: string;
  nacionalidade: string;
  estadoCivil: EstadoCivil | '';
  email: string;
  telefoneWhatsapp: string;
  enderecoProfissional: string;
  cepProfissional: string;
  cidadeProfissional: string;
  observacoes: string;
}
