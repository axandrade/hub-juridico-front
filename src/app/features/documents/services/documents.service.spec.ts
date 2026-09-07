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
