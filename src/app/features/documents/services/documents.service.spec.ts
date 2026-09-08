import { HttpEventType, HttpResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { DocumentsService } from './documents.service';

const BASE = environment.apiBaseUrl;

describe('DocumentsService', () => {
  let service: DocumentsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), DocumentsService],
    });
    service = TestBed.inject(DocumentsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('iniciarDownloadZip faz POST .../pastas/download-job com os ids em snake_case', () => {
    let job: { job_id: string } | undefined;
    service.iniciarDownloadZip(['p1'], ['d1', 'd2']).subscribe((j) => (job = j));

    const req = http.expectOne(`${BASE}/pastas/download-job`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ pasta_ids: ['p1'], documento_ids: ['d1', 'd2'] });
    req.flush({ job_id: 'job-9', status: 'compactando' });

    expect(job?.job_id).toBe('job-9');
  });

  it('statusDownloadZip faz GET .../pastas/download-job/{id} e cancelarDownloadZip faz DELETE', () => {
    service.statusDownloadZip('job-9').subscribe();
    http.expectOne(`${BASE}/pastas/download-job/job-9`).flush({ job_id: 'job-9', status: 'pronto' });

    service.cancelarDownloadZip('job-9').subscribe();
    const del = http.expectOne(`${BASE}/pastas/download-job/job-9`);
    expect(del.request.method).toBe('DELETE');
    del.flush(null);
  });

  it('baixarZipPronto faz GET .../download-job/{id}/arquivo como blob com progresso', () => {
    let corpo: Blob | undefined;
    service.baixarZipPronto('job-9').subscribe((evento) => {
      if (evento.type === HttpEventType.Response) {
        corpo = (evento as HttpResponse<Blob>).body ?? undefined;
      }
    });

    const req = http.expectOne(`${BASE}/pastas/download-job/job-9/arquivo`);
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    expect(req.request.reportProgress).toBe(true);

    const zip = new Blob(['PK...'], { type: 'application/zip' });
    req.flush(zip);
    expect(corpo).toBe(zip);
  });

  it('enviar (PUT único): pede a url, sobe o binário, confirma e emite progresso + concluido', () => {
    const eventos: string[] = [];
    const arquivo = new File(['conteudo'], 'contrato.pdf', { type: 'application/pdf' });
    service.enviar(1, null, arquivo).subscribe((ev) => eventos.push(ev.tipo));

    const urlReq = http.expectOne(`${BASE}/documentos/upload-url`);
    expect(urlReq.request.body).toEqual({
      pessoa_id: 1,
      pasta_id: null,
      content_type: 'application/pdf',
      tamanho_bytes: arquivo.size,
    });
    urlReq.flush({
      storage_key: 'pessoas/1/uuid.pdf',
      upload_url: 'https://storage.exemplo/put',
      http_method: 'PUT',
      expires_in_seconds: 900,
      chunked: false,
      chunk_size_bytes: null,
    });

    const putReq = http.expectOne('https://storage.exemplo/put');
    expect(putReq.request.method).toBe('PUT');
    expect(putReq.request.reportProgress).toBe(true);
    putReq.flush('ok');

    const confirmReq = http.expectOne(`${BASE}/documentos/confirmar`);
    expect(confirmReq.request.body).toMatchObject({
      storage_key: 'pessoas/1/uuid.pdf',
      nome_original: 'contrato.pdf',
    });
    confirmReq.flush({
      id: 'doc-9',
      pasta_id: null,
      nome_original: 'contrato.pdf',
      content_type: 'application/pdf',
      tamanho_bytes: arquivo.size,
      enviado_em: '2026-09-08T00:00:00Z',
    });

    expect(eventos).toContain('progresso');
    expect(eventos.at(-1)).toBe('concluido');
  });

  it('enviar (em blocos): fatia o arquivo em PUTs com Content-Range e confirma no fim', async () => {
    const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
    const eventos: string[] = [];
    const arquivo = new File([new Uint8Array(10)], 'grande.pdf', { type: 'application/pdf' });
    service.enviar(1, null, arquivo).subscribe((ev) => eventos.push(ev.tipo));

    http.expectOne(`${BASE}/documentos/upload-url`).flush({
      storage_key: 'pessoas/1/uuid.pdf',
      upload_url: 'https://graph.exemplo/session',
      http_method: 'PUT',
      expires_in_seconds: 900,
      chunked: true,
      chunk_size_bytes: 4,
    });
    await tick();

    // 10 bytes / blocos de 4 => 3 PUTs (0-3, 4-7, 8-9), sequenciais.
    const faixas = ['bytes 0-3/10', 'bytes 4-7/10', 'bytes 8-9/10'];
    for (const faixa of faixas) {
      const bloco = http.expectOne('https://graph.exemplo/session');
      expect(bloco.request.headers.get('Content-Range')).toBe(faixa);
      bloco.flush('');
      await tick();
    }

    http.expectOne(`${BASE}/documentos/confirmar`).flush({
      id: 'doc-9',
      pasta_id: null,
      nome_original: 'grande.pdf',
      content_type: 'application/pdf',
      tamanho_bytes: 10,
      enviado_em: '2026-09-08T00:00:00Z',
    });

    expect(eventos.at(-1)).toBe('concluido');
  });

  it('converterParaPdf faz POST .../documentos/{id}/converter-pdf e devolve o Documento', () => {
    let resultado: { id: string; nome: string } | undefined;
    service.converterParaPdf('doc-1').subscribe((d) => (resultado = d));

    const req = http.expectOne(`${BASE}/documentos/doc-1/converter-pdf`);
    expect(req.request.method).toBe('POST');
    req.flush({
      id: 'doc-2',
      pasta_id: null,
      nome_original: 'foto.pdf',
      content_type: 'application/pdf',
      tamanho_bytes: 4321,
      enviado_em: '2026-09-07T10:00:00Z',
    });

    expect(resultado?.id).toBe('doc-2');
    expect(resultado?.nome).toBe('foto.pdf');
  });

});
