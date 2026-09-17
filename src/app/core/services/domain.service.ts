import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

/**
 * Página devolvida por `GET /domain/{entidade}` (paginado) — mesmo formato de
 * `IPage`/`PageImpl` do ddd-noap (backend), campo a campo.
 *
 * ATENÇÃO: aqui a assimetria é AO CONTRÁRIO da leitura de item único documentada abaixo —
 * o envelope da página (este objeto) é uma classe Java de verdade (`PageImpl`, com getters
 * `getTotalPages()`/`isHasContent()`/...), então O JACKSON APLICA sim o `PropertyNamingStrategy`
 * snake_case nele. Só o `content` (lista de `Map<String,Object>`) fica em camelCase.
 * Confirmado batendo direto no backend (`curl`), não é suposição.
 */
export interface IDomainPage<T> {
  content: T[];
  first: boolean;
  last: boolean;
  has_next: boolean;
  has_previous: boolean;
  has_content: boolean;
  number: number;
  page_number: number;
  number_of_elements: number;
  size: number;
  page_size: number;
  total_elements: number;
  total_pages: number;
}

/** Corpo de erro do ddd-noap (`ProblemDetail`) — mesmo shape em qualquer endpoint `/domain/**`. */
export interface IProblemDetail {
  status?: number;
  title?: string;
  detail?: string;
  details?: string[];
}

/** Base comum de todo "comando" — mesmo espírito de `IDomainBase` do `@b2software/domain-ng`. */
export interface IDomainCommandBase {
  entityName: string;
}

/**
 * `entityId` presente → ficha única (`GET /domain/{entity}/{id}`); ausente → lista, paginada
 * por padrão ou completa se `all: true` (`GET /domain/{entity}/all`) — mesmo comando único
 * cobrindo os dois casos, igual `IGetDomainCommand` do cev-front.
 */
export interface IGetDomainCommand extends IDomainCommandBase {
  entityId?: string | number;
  page?: number;
  size?: number;
  all?: boolean;
  /** Campos a devolver (`fields=nome,oab`); sem isso, o backend decide o conjunto padrão. */
  fields?: string;
  /** RQL: `campo op valor`, `and`/`or` sem parênteses, avaliação estrita da esquerda pra
   *  direita — ver docs/ANALISE-ARQUITETURA.md do ddd-noap. Operadores: eq/ne/gt/lt/ge/le/like/ilike. */
  filter?: string;
  /** `campo` (asc) ou `-campo` (desc), múltiplos separados por vírgula. */
  sort?: string;
}

export interface IPostDomainCommand<T = Record<string, unknown>> extends IDomainCommandBase {
  fields?: string;
  body: Partial<T> | Record<string, unknown>;
}

export interface IPatchDomainCommand<T = Record<string, unknown>> extends IDomainCommandBase {
  entityId: string | number;
  fields?: string;
  body: Partial<T> | Record<string, unknown>;
}

export interface IDeleteDomainCommand extends IDomainCommandBase {
  entityId: string | number;
}

/**
 * Comando pro `POST /domain/service/{service}/{método}` — invocação genérica de método de bean
 * `@Service` (não amarrado a nenhuma entidade), usado quando a regra de negócio é grande demais
 * pra caber num `@Create`/`@Update` de entidade (ex.: `UserService` — hash de senha, proteção de
 * último admin). `args` é um mapa nome-do-parâmetro → valor, casando com os nomes reais dos
 * parâmetros do método Java (o projeto compila com `-parameters`, preserva os nomes).
 */
export interface IPostServiceMethodCommand {
  /** Nome da classe do service em kebab-case (`UserService` -> `user-service`). */
  serviceName: string;
  /** Nome do método em kebab-case (`redefinirSenha` -> `redefinir-senha`). */
  method: string;
  args?: Record<string, unknown>;
}

/**
 * Cliente genérico do CRUD por reflection do ddd-noap (`/domain/{entidade}`) — mesmo conceito
 * e mesma forma de API do `DomainService` do `@b2software/domain-ng` usado no cev-front
 * (um método por verbo, recebendo um "comando" único com `entityName` + o resto), mas escrito
 * do zero aqui, sem essa dependência: `get(command)`, `post(command)`, `patch(command)`,
 * `delete(command)`. (`put`/`namedQuery`/`service`/`dataSource` do original não têm equivalente
 * ainda — nenhuma entidade nossa usa método de negócio via PUT ou named query por enquanto.)
 *
 * ATENÇÃO à assimetria de naming entre leitura e escrita, verificada direto no código do
 * ddd-noap (`ResultProcessor`/`JsonMappingService`) — não é opcional, é como o backend
 * realmente se comporta com o `JacksonConfig` (snake_case) do hub-juridico-api:
 * - LEITURA (GET): o backend monta um `Map<String,Object>` por reflection usando o nome
 *   literal do campo Java (camelCase) — o `PropertyNamingStrategy` do Jackson não se aplica a
 *   chaves de Map, só a propriedades de bean. Ou seja, a resposta vem em **camelCase**
 *   (`estadoCivil`, `telefoneWhatsapp`...), mesmo o resto da API sendo snake_case.
 * - ESCRITA (POST/PATCH): o corpo é desserializado direto na entidade JPA via
 *   `ObjectMapper.readerForUpdating` (bean binding de verdade), que respeita o
 *   `PropertyNamingStrategy` — então o corpo enviado precisa estar em **snake_case**.
 * - ENVELOPE DE PÁGINA (`IDomainPage`, no `get()` sem `entityId`): ao contrário do `content`, o
 *   envelope em si (`PageImpl`) É um bean de verdade (getters `getTotalPages()`/`isHasContent()`/...),
 *   então ESSE sim vem em **snake_case** (`total_pages`, `has_content`...) — só o `content`
 *   interno fica em camelCase.
 */
@Injectable({ providedIn: 'root' })
export class DomainService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.domainBaseUrl;

  /**
   * `GET`. Chame com `entityId` pra ficha única (`Observable<T>`) ou sem ele pra lista
   * (`Observable<IDomainPage<T>>`, ou `T[]` se `all: true`) — o `T` do generics é quem você
   * pede, igual o `get<T>()` solto-tipado do cev-front.
   */
  get<T>(command: IGetDomainCommand): Observable<T> {
    let params = new HttpParams();
    if (command.entityId != null) {
      if (command.fields) {
        params = params.set('fields', command.fields);
      }
      return this.http.get<T>(`${this.base}/${command.entityName}/${command.entityId}`, { params });
    }
    params = params.set('size', command.size ?? 10);
    if (command.page != null) {
      params = params.set('page', command.page);
    }
    if (command.fields) {
      params = params.set('fields', command.fields);
    }
    if (command.filter) {
      params = params.set('filter', command.filter);
    }
    if (command.sort) {
      params = params.set('sort', command.sort);
    }
    const path = command.all ? `${command.entityName}/all` : command.entityName;
    return this.http.get<T>(`${this.base}/${path}`, { params });
  }

  /**
   * `POST /domain/{entidade}`. Resposta padrão do backend é só `{ id: ... }` (sem `fields`,
   * ver `PostController.insert`) — por isso quem chama normalmente encadeia um `get()` com
   * `entityId` depois pra pegar a ficha completa (ver `AdvogadoFormComponent.salvar`).
   */
  post<T = Record<string, unknown>>(command: IPostDomainCommand<T>): Observable<{ id: number }> {
    let params = new HttpParams();
    if (command.fields) {
      params = params.set('fields', command.fields);
    }
    return this.http.post<{ id: number }>(`${this.base}/${command.entityName}`, command.body, { params });
  }

  /**
   * `PATCH /domain/{entidade}/{id}` (merge parcial). Sem `fields`, o backend devolve
   * `204 No Content` (ver `PatchController.update`) — por isso `Observable<void>`; quem
   * chama encadeia `get()` se precisar da ficha atualizada.
   */
  patch<T = Record<string, unknown>>(command: IPatchDomainCommand<T>): Observable<void> {
    let params = new HttpParams();
    if (command.fields) {
      params = params.set('fields', command.fields);
    }
    return this.http.patch<void>(`${this.base}/${command.entityName}/${command.entityId}`, command.body, { params });
  }

  /** `DELETE /domain/{entidade}/{id}`. */
  delete(command: IDeleteDomainCommand): Observable<void> {
    return this.http.delete<void>(`${this.base}/${command.entityName}/${command.entityId}`);
  }

  /**
   * `POST /domain/service/{service}/{método}` — chama um método de um bean `@Service` direto
   * (ver `IPostServiceMethodCommand`). Diferente de `post()`/`patch()`: a resposta aqui é o que
   * o método Java devolver, serializado normal (bean de verdade, `JacksonConfig` snake_case) —
   * não o `Map` cru em camelCase que `/domain/{entidade}` devolve. `T` é o tipo dessa resposta.
   */
  postServiceMethod<T>(command: IPostServiceMethodCommand): Observable<T> {
    return this.http.post<T>(`${this.base}/service/${command.serviceName}/${command.method}`, {
      args: command.args ?? {},
    });
  }
}
