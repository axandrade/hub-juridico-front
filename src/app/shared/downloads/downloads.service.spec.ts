import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { DownloadsService, POLL_MS } from './downloads.service';

const BASE = environment.apiBaseUrl;

const jobBase = {
  job_id: 'j1',
  status: 'compactando' as const,
  nome_arquivo: 'Processo',
  total_arquivos: 2,
  arquivos_processados: 0,
  bytes_totais: 1000,
  bytes_processados: 0,
};

describe('DownloadsService', () => {
  let service: DownloadsService;
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), DownloadsService],
    });
    service = TestBed.inject(DownloadsService);
    http = TestBed.inject(HttpTestingController);

    const u = URL as unknown as Record<string, unknown>;
    u['createObjectURL'] ??= () => '';
    u['revokeObjectURL'] ??= () => undefined;
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('cria o job, faz polling da compactação e baixa o zip pronto', () => {
    service.baixarZip('Processo.zip', ['p1'], []);

    expect(service.tarefas()[0].status).toBe('preparando');

    http.expectOne(`${BASE}/pastas/download-job`).flush(jobBase);
    expect(service.tarefas()[0].status).toBe('compactando');
    expect(service.tarefas()[0].totalArquivos).toBe(2);
    expect(service.tarefas()[0].progresso).toBe(0);

    vi.advanceTimersByTime(POLL_MS);
    http
      .expectOne(`${BASE}/pastas/download-job/j1`)
      .flush({ ...jobBase, arquivos_processados: 1, bytes_processados: 500 });
    expect(service.tarefas()[0].progresso).toBe(0.5);
    expect(service.tarefas()[0].arquivosProcessados).toBe(1);

    vi.advanceTimersByTime(POLL_MS);
    http.expectOne(`${BASE}/pastas/download-job/j1`).flush({ ...jobBase, status: 'pronto' });

    expect(service.tarefas()[0].status).toBe('baixando');
    const zip = new Blob(['PK...'], { type: 'application/zip' });
    http.expectOne(`${BASE}/pastas/download-job/j1/arquivo`).flush(zip);

    expect(service.tarefas()[0].status).toBe('concluido');
    expect(service.tarefas()[0].progresso).toBe(1);
    expect(URL.createObjectURL).toHaveBeenCalledWith(zip);

    // Limpeza do temp no servidor.
    http.expectOne(`${BASE}/pastas/download-job/j1`).flush(null);
  });

  it('status "erro" no polling marca a tarefa como erro', () => {
    service.baixarZip('x.zip', ['p1'], []);
    http.expectOne(`${BASE}/pastas/download-job`).flush(jobBase);

    vi.advanceTimersByTime(POLL_MS);
    http.expectOne(`${BASE}/pastas/download-job/j1`).flush({ ...jobBase, status: 'erro' });

    expect(service.tarefas()[0].status).toBe('erro');
    expect(service.quantidadeAtivas()).toBe(0);
  });

  it('cancelar aborta o polling e manda DELETE do job', () => {
    service.baixarZip('x.zip', ['p1'], []);
    http.expectOne(`${BASE}/pastas/download-job`).flush(jobBase);

    service.cancelar(service.tarefas()[0].id);

    expect(service.tarefas()[0].status).toBe('cancelado');
    http.expectOne(`${BASE}/pastas/download-job/j1`).flush(null);

    // Não deve mais fazer polling depois de cancelado.
    vi.advanceTimersByTime(POLL_MS * 2);
    http.expectNone(`${BASE}/pastas/download-job/j1`);
  });

  it('limparEncerradas mantém só as tarefas ativas', () => {
    service.baixarZip('a.zip', ['p1'], []);
    http.expectOne(`${BASE}/pastas/download-job`).flush({ ...jobBase, job_id: 'ja' });

    service.baixarZip('b.zip', ['p2'], []);
    http.expectOne(`${BASE}/pastas/download-job`).flush({ ...jobBase, job_id: 'jb' });

    vi.advanceTimersByTime(POLL_MS);
    http.expectOne(`${BASE}/pastas/download-job/ja`).flush({ ...jobBase, job_id: 'ja' });
    http.expectOne(`${BASE}/pastas/download-job/jb`).flush({ ...jobBase, job_id: 'jb', status: 'erro' });

    service.limparEncerradas();

    expect(service.tarefas().length).toBe(1);
    expect(service.tarefas()[0].nome).toBe('a.zip');

    // encerra a que sobrou pra não vazar timer no afterEach
    service.cancelar(service.tarefas()[0].id);
    http.expectOne(`${BASE}/pastas/download-job/ja`).flush(null);
  });
});
