import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { DomainFavoritoService } from '../../../core/services/domain-favorito.service';
import { ProcessoApi } from './processo-api.model';
import { ProcessoService } from './processo-service';

const DOMAIN_BASE = environment.domainBaseUrl;

/**
 * Ficha crua mínima (só escalares) — reproduz literalmente o que `/domain/processo/{id}` devolve
 * quando nenhuma coleção tem dado: confirmado direto na API (curl), o dump por reflexão do
 * ddd-noap OMITE o campo inteiro (não manda `[]`) pra toda `@ElementCollection` vazia/não
 * carregada, mesmo pedindo o campo explicitamente em `fields=`. Isso é o que fazia
 * `buscarCompleto` quebrar (`[...raw.tribunaisHistorico]`/`raw.clientes.map` em cima de
 * `undefined`) e virar silenciosamente `null` (engolido pelo `catchError`) — o painel nunca
 * carregava. Este objeto NÃO inclui nenhuma das chaves de coleção de propósito.
 */
const FICHA_CRUA_SEM_COLECOES = {
  id: 1,
  tipo: 'JUDICIAL',
  numeroCnj: '0801234-56.2026.5.07.0001',
  status: 'ativo',
  statusId: 1,
  pasta: 'PROC-000001',
  advogadoResponsavelId: 1,
  dataDistribuicao: '2026-03-12',
  acao: null,
  acaoId: null,
  natureza: null,
  naturezaId: null,
  procedimento: null,
  procedimentoId: null,
  fase: null,
  faseId: null,
  uf: null,
  cidade: null,
  cidadeId: null,
  observacoesGerais: 'Aguardando designação de audiência inicial.',
  destacarObservacao: false,
  objetoPrincipal: null,
  observacoesObjeto: null,
  valorPedido: null,
  valorDeferido: null,
  // `@Embedded`, não é `@ElementCollection` — sempre vem, mesmo com os 3 campos internos nulos.
  cenarioProvavel: { provisionar: true },
  cenarioPossivel: { provisionar: true },
  cenarioRemoto: { provisionar: true },
  tribunalAtualId: null,
  orgaoProcessanteId: null,
  ativo: true,
  atualizadoEm: '2026-09-14T20:58:04.618386Z',
};

describe('ProcessoService — buscarCompleto', () => {
  let service: ProcessoService;
  let http: HttpTestingController;
  let domainFavoritoService: { listarFavoritos: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    domainFavoritoService = { listarFavoritos: vi.fn().mockReturnValue(of(new Map())) };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ProcessoService,
        { provide: DomainFavoritoService, useValue: domainFavoritoService },
      ],
    });
    service = TestBed.inject(ProcessoService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('processo sem nenhuma coleção carregada monta a ficha com listas vazias, em vez de virar null', () => {
    let resultado: ProcessoApi | null | undefined;
    service.buscarCompleto(1).subscribe((r) => (resultado = r));

    const req = http.expectOne((r) => r.url === `${DOMAIN_BASE}/processo/1`);
    expect(req.request.method).toBe('GET');
    req.flush(FICHA_CRUA_SEM_COLECOES);

    expect(resultado).not.toBeNull();
    expect(resultado).toBeDefined();
    expect(resultado!.id).toBe(1);
    expect(resultado!.clientes).toEqual([]);
    expect(resultado!.partes_contrarias).toEqual([]);
    expect(resultado!.outros_envolvidos_advogados).toEqual([]);
    expect(resultado!.outros_envolvidos_magistrados).toEqual([]);
    expect(resultado!.outros_envolvidos_testemunhas).toEqual([]);
    expect(resultado!.outros_envolvidos_peritos).toEqual([]);
    expect(resultado!.outros_envolvidos_assistentes_tecnicos).toEqual([]);
    expect(resultado!.objetos_secundarios).toEqual([]);
    expect(resultado!.escritorios_anteriores).toEqual([]);
    expect(resultado!.tags).toEqual([]);
    expect(resultado!.observacoes_previas).toEqual([]);
    expect(resultado!.tribunais_historico).toEqual([]);
    expect(resultado!.tribunal_atual).toBeNull();
    expect(resultado!.orgao_processante).toBeNull();
  });

  it('pede os campos das coleções explicitamente (sem isso o backend nem tenta carregá-las)', () => {
    service.buscarCompleto(1).subscribe();

    const req = http.expectOne((r) => r.url === `${DOMAIN_BASE}/processo/1`);
    const fields = req.request.params.get('fields');
    expect(fields).toBeTruthy();
    ['clientes', 'outrosEnvolvidosMagistrados', 'outrosEnvolvidosPeritos', 'tribunaisHistorico', 'tags']
      .forEach((campo) => expect(fields).toContain(campo));

    req.flush(FICHA_CRUA_SEM_COLECOES);
  });

  it('resolve nomes de magistrado/perito/órgão/tribunal quando as coleções vêm preenchidas, e mantém [] no que ficou de fora', () => {
    const fichaCrua = {
      ...FICHA_CRUA_SEM_COLECOES,
      id: 5,
      orgaoProcessanteId: 10,
      clientes: [{ pessoaId: 1, posicaoId: null, principal: true }],
      outrosEnvolvidosMagistrados: [{ magistradoId: 7, resultado: 'Favorável', orgaoId: 10, data: '2026-01-10' }],
      outrosEnvolvidosPeritos: [{ peritoId: 3, resultado: null }],
      // tags/objetosSecundarios/escritoriosAnteriores/partesContrarias/etc. seguem ausentes.
    };

    let resultado: ProcessoApi | null | undefined;
    service.buscarCompleto(5).subscribe((r) => (resultado = r));

    http.expectOne((r) => r.url === `${DOMAIN_BASE}/processo/5`).flush(fichaCrua);
    http.expectOne((r) => r.url === `${DOMAIN_BASE}/magistrado`).flush({ content: [{ id: 7, nome: 'Juiz Fernando Aragão' }] });
    http.expectOne((r) => r.url === `${DOMAIN_BASE}/perito`).flush({ content: [{ id: 3, nome: 'Perito Teste', cpf: null }] });
    http
      .expectOne((r) => r.url === `${DOMAIN_BASE}/orgao-julgador`)
      .flush({ content: [{ id: 10, nome: 'Vara do Trabalho de Fortaleza', tribunalId: 99 }] });
    http.expectOne((r) => r.url === `${DOMAIN_BASE}/tribunal`).flush({ content: [{ id: 99, nome: 'TRT-7' }] });

    expect(resultado).not.toBeNull();
    expect(resultado!.clientes).toEqual([{ pessoa_id: 1, posicao_id: null, principal: true }]);
    expect(resultado!.outros_envolvidos_magistrados).toEqual([
      {
        magistrado: { id: 7, nome: 'Juiz Fernando Aragão' },
        resultado: 'Favorável',
        orgao: { id: 10, nome: 'TRT-7 - Vara do Trabalho de Fortaleza', tribunal_id: 99 },
        data: '2026-01-10',
      },
    ]);
    expect(resultado!.outros_envolvidos_peritos).toEqual([
      { perito: { id: 3, nome: 'Perito Teste', cpf: null }, resultado: null },
    ]);
    expect(resultado!.orgao_processante).toEqual({ id: 10, nome: 'TRT-7 - Vara do Trabalho de Fortaleza', tribunal_id: 99 });
    // tribunalAtualId nulo e sem histórico — "tribunal atual" fica null mesmo com o órgão resolvido.
    expect(resultado!.tribunal_atual).toBeNull();
    expect(resultado!.tags).toEqual([]);
    expect(resultado!.partes_contrarias).toEqual([]);
  });

  it('mantém o comportamento anterior quando o backend devolve tudo normalmente (sem regressão no caminho feliz)', () => {
    let resultado: ProcessoApi | null | undefined;
    service.buscarCompleto(1).subscribe((r) => (resultado = r));

    http.expectOne((r) => r.url === `${DOMAIN_BASE}/processo/1`).flush(FICHA_CRUA_SEM_COLECOES);

    expect(resultado).not.toBeNull();
    expect(resultado!.numero_cnj).toBe('0801234-56.2026.5.07.0001');
    expect(resultado!.status).toBe('ativo');
    expect(resultado!.favorito).toBe(false);
  });
});
