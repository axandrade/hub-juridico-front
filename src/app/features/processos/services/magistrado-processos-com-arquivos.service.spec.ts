import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { MagistradoProcessosComArquivosService } from './magistrado-processos-com-arquivos.service';
import { ProcessoPastaResumoApi } from './processo-pasta-resumo.model';

const URL = `${environment.apiBaseUrl}/magistrados/9/pastas-magistrado/processos`;

describe('MagistradoProcessosComArquivosService', () => {
  let service: MagistradoProcessosComArquivosService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), MagistradoProcessosComArquivosService],
    });
    service = TestBed.inject(MagistradoProcessosComArquivosService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('busca a lista do magistrado certo e mapeia a contagem (pastas/documentos/tamanho) sem perder valor', () => {
    const linha: ProcessoPastaResumoApi = {
      processo_id: 1,
      numero_processo: '0801234-56.2026.5.07.0001',
      pasta_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      qtd_pastas: 1,
      qtd_documentos: 2,
      tamanho_total_bytes: 3000,
      ultimo_envio_em: '2026-09-17T19:48:28.918411Z',
    };

    let resultado: unknown;
    service.listar(9).subscribe((r) => (resultado = r));

    const req = http.expectOne(URL);
    expect(req.request.method).toBe('GET');
    req.flush([linha]);

    const itens = resultado as any[];
    expect(itens).toHaveLength(1);
    expect(itens[0].processoId).toBe(1);
    expect(itens[0].qtdPastas).toBe(1);
    expect(itens[0].qtdDocumentos).toBe(2);
    expect(itens[0].tamanhoTotalBytes).toBe(3000);
    expect(itens[0].pastaId).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(itens[0].ultimoEnvioEm instanceof Date).toBe(true);
  });

  it('processo sem subpasta ainda vem com contagem zerada e pasta_id nulo — não é descartado', () => {
    const linhaZerada: ProcessoPastaResumoApi = {
      processo_id: 2,
      numero_processo: '1002345-67.2025.8.06.0001',
      pasta_id: null,
      qtd_pastas: 0,
      qtd_documentos: 0,
      tamanho_total_bytes: 0,
      ultimo_envio_em: null,
    };

    let resultado: any[] = [];
    service.listar(9).subscribe((r) => (resultado = r));
    http.expectOne(URL).flush([linhaZerada]);

    expect(resultado).toHaveLength(1);
    expect(resultado[0].pastaId).toBeNull();
    expect(resultado[0].qtdPastas).toBe(0);
    expect(resultado[0].qtdDocumentos).toBe(0);
    expect(resultado[0].tamanhoTotalBytes).toBe(0);
    expect(resultado[0].ultimoEnvioEm).toBeNull();
  });

  it('não soma/agrupa nada por conta própria — devolve exatamente uma linha por processo, na ordem que o backend mandou', () => {
    const linhas: ProcessoPastaResumoApi[] = [
      {
        processo_id: 2,
        numero_processo: 'PROC-2',
        pasta_id: null,
        qtd_pastas: 0,
        qtd_documentos: 0,
        tamanho_total_bytes: 0,
        ultimo_envio_em: null,
      },
      {
        processo_id: 1,
        numero_processo: 'PROC-1',
        pasta_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        qtd_pastas: 3,
        qtd_documentos: 7,
        tamanho_total_bytes: 12345,
        ultimo_envio_em: '2026-09-01T00:00:00Z',
      },
    ];

    let resultado: any[] = [];
    service.listar(9).subscribe((r) => (resultado = r));
    http.expectOne(URL).flush(linhas);

    expect(resultado.map((r) => r.processoId)).toEqual([2, 1]);
    expect(resultado[1].qtdDocumentos).toBe(7);
    expect(resultado[1].tamanhoTotalBytes).toBe(12345);
  });
});
