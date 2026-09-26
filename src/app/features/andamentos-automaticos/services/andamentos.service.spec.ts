import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { AndamentoApi, AndamentosProcessoApi, AndamentosService, PublicacaoApi } from './andamentos.service';
import { andamento, painel, publicacao } from './andamentos.testing';

const URL = `${environment.apiBaseUrl}/processos/1/andamentos`;

describe('AndamentosService', () => {
  let service: AndamentosService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AndamentosService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function carregar(resposta: AndamentosProcessoApi): Promise<void> {
    const pronto = firstValueFrom(service.consultar(1));
    http.expectOne((r) => r.url === URL).flush(resposta);
    await pronto;
  }

  describe('consulta', () => {
    it('abre o processo sem `atualizar` — o backend devolve o que está gravado', async () => {
      const pronto = firstValueFrom(service.consultar(1));
      const req = http.expectOne((r) => r.url === URL);
      expect(req.request.params.has('atualizar')).toBe(false);
      req.flush(painel());
      await pronto;
    });

    it('reaproveita a mesma resposta entre as abas (uma requisição só)', async () => {
      await carregar(painel());
      await firstValueFrom(service.consultar(1));
      http.expectNone((r) => r.url === URL);
    });

    it('depois do "Atualizar", a próxima consulta vai com `atualizar=true` — uma vez só, pras três abas', async () => {
      await carregar(painel());

      service.recarregar(1);
      const aba1 = firstValueFrom(service.consultar(1));
      const aba2 = firstValueFrom(service.consultar(1));
      const req = http.expectOne((r) => r.url === URL);
      expect(req.request.params.get('atualizar')).toBe('true');
      req.flush(painel());
      await Promise.all([aba1, aba2]);
    });

    it('o "Atualizar" de um processo não vale pro outro', async () => {
      service.recarregar(1);

      const outro = firstValueFrom(service.consultar(2));
      const req = http.expectOne(`${environment.apiBaseUrl}/processos/2/andamentos`);
      expect(req.request.params.has('atualizar')).toBe(false);
      req.flush(painel());
      await outro;
    });
  });

  describe('novidades', () => {
    const novoAndamento: AndamentoApi = andamento({ chave: 'a-novo', novo: true });
    const andamentoVisto: AndamentoApi = andamento({ chave: 'a-velho', novo: false });
    const novaPublicacao: PublicacaoApi = publicacao({ chave: 'p-novo', novo: true });

    it('conta só o que o servidor marcou como novo', async () => {
      await carregar(painel({ andamentos: [novoAndamento, andamentoVisto], publicacoes: [novaPublicacao] }));

      expect(service.novos(1)).toEqual({ andamentos: 1, publicacoes: 1 });
      expect(service.ehNovo(1, novoAndamento)).toBe(true);
      expect(service.ehNovo(1, andamentoVisto)).toBe(false);
    });

    it('sem resposta ainda, não há novidades', () => {
      expect(service.novos(1)).toEqual({ andamentos: 0, publicacoes: 0 });
    });

    it('marcar como visto tira o negrito na hora e avisa o backend com as chaves', async () => {
      await carregar(painel({ andamentos: [novoAndamento, andamentoVisto] }));

      service.marcarVistos(1, [novoAndamento, andamentoVisto]);

      expect(service.ehNovo(1, novoAndamento)).toBe(false);
      expect(service.novos(1).andamentos).toBe(0);
      const req = http.expectOne(`${URL}/vistos`);
      expect(req.request.method).toBe('POST');
      // Só o que era novidade vai pro servidor.
      expect(req.request.body).toEqual({ chaves: ['a-novo'] });
      req.flush(null, { status: 204, statusText: 'No Content' });
    });

    it('clicar de novo num item já visto não chama o backend', async () => {
      await carregar(painel({ andamentos: [novoAndamento] }));
      service.marcarVistos(1, [novoAndamento]);
      http.expectOne(`${URL}/vistos`).flush(null, { status: 204, statusText: 'No Content' });

      service.marcarVistos(1, [novoAndamento]);

      http.expectNone(`${URL}/vistos`);
    });

    it('se o backend recusar, o item volta a aparecer como novo', async () => {
      await carregar(painel({ andamentos: [novoAndamento] }));

      service.marcarVistos(1, [novoAndamento]);
      http.expectOne(`${URL}/vistos`).flush(null, { status: 500, statusText: 'Erro' });

      expect(service.ehNovo(1, novoAndamento)).toBe(true);
    });

    it('a publicação do DJEN vista numa aba sai do negrito na outra (mesma chave)', async () => {
      const comoAndamento = andamento({ chave: 'djen-1', novo: true, fonte: 'Comunica/DJEN' });
      const comoPublicacao = publicacao({ chave: 'djen-1', novo: true });
      await carregar(painel({ andamentos: [comoAndamento], publicacoes: [comoPublicacao] }));

      service.marcarVistos(1, [comoPublicacao]);
      http.expectOne(`${URL}/vistos`).flush(null, { status: 204, statusText: 'No Content' });

      expect(service.ehNovo(1, comoAndamento)).toBe(false);
      expect(service.novos(1)).toEqual({ andamentos: 0, publicacoes: 0 });
    });

    it('"Marcar todos como vistos" zera as duas abas e manda `todos: true`', async () => {
      await carregar(painel({ andamentos: [novoAndamento, andamentoVisto], publicacoes: [novaPublicacao] }));

      service.marcarTodosVistos(1);

      expect(service.novos(1)).toEqual({ andamentos: 0, publicacoes: 0 });
      const req = http.expectOne(`${URL}/vistos`);
      expect(req.request.body).toEqual({ todos: true });
      req.flush(null, { status: 204, statusText: 'No Content' });
    });

    it('"Marcar todos" sem novidades não chama o backend', async () => {
      await carregar(painel({ andamentos: [andamentoVisto] }));

      service.marcarTodosVistos(1);

      http.expectNone(`${URL}/vistos`);
    });
  });
});
