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
});
