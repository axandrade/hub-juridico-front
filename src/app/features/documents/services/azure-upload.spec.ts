import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../../../environments/environment';
import { authInterceptor } from '../../../core/auth/auth.interceptor';
import { TokenStore } from '../../../core/auth/token-store';
import { DocumentsService } from './documents.service';
import { MagistradoDocumentsService } from './magistrado-documents.service';
import { PeritoDocumentsService } from './perito-documents.service';
import { DocumentsPort } from './documents-port';

const URL = 'https://sthubjuridicodocs.blob.core.windows.net/documentos/teste.pdf?sig=ficticia';

describe('upload direto para Azure', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(), provideRouter([]),
    ] });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(TokenStore).setTokens({ access: 'jwt-api', refresh: 'refresh-api' }, false);
  });

  afterEach(() => http.verify());

  for (const [serviceType, route] of [
    [DocumentsService, 'documentos'],
    [MagistradoDocumentsService, 'documentos-magistrado'],
    [PeritoDocumentsService, 'documentos-perito'],
  ] as const) {
    it(`${route}: envia headers sem JWT e confirma somente após PUT 201`, () => {
      const service = TestBed.inject<DocumentsPort>(serviceType);
      const file = new File(['pdf'], 'teste.pdf', { type: 'application/pdf' });
      const events: string[] = [];
      service.enviar(1, null, file).subscribe(event => events.push(event.tipo));
      const signed = http.expectOne(`${environment.apiBaseUrl}/${route}/upload-url`);
      expect(signed.request.headers.get('Authorization')).toBe('Bearer jwt-api');
      signed.flush({
        storage_key: 'teste.pdf', upload_url: URL, http_method: 'PUT', expires_in_seconds: 600,
        chunked: false, headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': 'application/pdf' },
      });
      http.expectNone(`${environment.apiBaseUrl}/${route}/confirmar`);
      const put = http.expectOne(URL);
      expect(put.request.method).toBe('PUT');
      expect(put.request.body).toBe(file);
      expect(put.request.headers.get('x-ms-blob-type')).toBe('BlockBlob');
      expect(put.request.headers.get('Content-Type')).toBe('application/pdf');
      expect(put.request.headers.has('Authorization')).toBe(false);
      expect(put.request.headers.has('Content-Range')).toBe(false);
      put.flush('', { status: 201, statusText: 'Created' });
      const confirm = http.expectOne(`${environment.apiBaseUrl}/${route}/confirmar`);
      expect(confirm.request.headers.get('Authorization')).toBe('Bearer jwt-api');
      confirm.flush({ id: '1', nome_original: 'teste.pdf', content_type: 'application/pdf', tamanho_bytes: 3 });
      expect(events.at(-1)).toBe('concluido');
    });

    it(`${route}: não confirma um upload que falhou`, () => {
      let status: number | undefined;
      TestBed.inject<DocumentsPort>(serviceType).enviar(1, null, new File(['pdf'], 'teste.pdf', { type: 'application/pdf' }))
        .subscribe({ error: error => status = error.status });
      http.expectOne(`${environment.apiBaseUrl}/${route}/upload-url`).flush({
        storage_key: 'teste.pdf', upload_url: URL, http_method: 'PUT', chunked: false,
        headers: { 'x-ms-blob-type': 'BlockBlob' },
      });
      http.expectOne(URL).flush('', { status: 403, statusText: 'Forbidden' });
      http.expectNone(`${environment.apiBaseUrl}/${route}/confirmar`);
      expect(status).toBe(403);
    });
  }

  it('download SAS não envia JWT nem tenta refresh em 401', () => {
    let status: number | undefined;
    TestBed.inject(HttpClient).get(URL, { responseType: 'blob' }).subscribe({ error: error => status = error.status });
    const download = http.expectOne(URL);
    expect(download.request.headers.has('Authorization')).toBe(false);
    download.flush(null, { status: 401, statusText: 'Unauthorized' });
    http.expectNone(`${environment.apiBaseUrl}/auth/refresh`);
    expect(status).toBe(401);
  });
});
