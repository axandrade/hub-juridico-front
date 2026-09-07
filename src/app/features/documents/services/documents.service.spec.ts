import { provideHttpClient } from '@angular/common/http';
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

  it('baixarPastaZip faz GET .../pastas/{id}/download como blob', () => {
    let resultado: Blob | undefined;
    service.baixarPastaZip('abc-123').subscribe((b) => (resultado = b));

    const req = http.expectOne(`${BASE}/pastas/abc-123/download`);
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');

    const zip = new Blob(['PK...'], { type: 'application/zip' });
    req.flush(zip);
    expect(resultado).toBe(zip);
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

  it('baixarSelecaoZip faz POST .../pastas/download com os ids em snake_case, como blob', () => {
    let resultado: Blob | undefined;
    service.baixarSelecaoZip(['p1', 'p2'], ['d1']).subscribe((b) => (resultado = b));

    const req = http.expectOne(`${BASE}/pastas/download`);
    expect(req.request.method).toBe('POST');
    expect(req.request.responseType).toBe('blob');
    expect(req.request.body).toEqual({ pasta_ids: ['p1', 'p2'], documento_ids: ['d1'] });

    const zip = new Blob(['PK...'], { type: 'application/zip' });
    req.flush(zip);
    expect(resultado).toBe(zip);
  });
});
