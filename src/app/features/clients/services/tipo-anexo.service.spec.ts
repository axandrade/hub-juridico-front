import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { TipoAnexoService } from './tipo-anexo.service';

const URL = `${environment.apiBaseUrl}/tipos-anexo`;

describe('TipoAnexoService — catálogo em signal', () => {
  let service: TipoAnexoService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), TipoAnexoService],
    });
    service = TestBed.inject(TipoAnexoService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function carregar(): void {
    service.carregar();
    http.expectOne(URL).flush([
      { id: 1, nome: 'Anexo geral' },
      { id: 2, nome: 'Parecer' },
    ]);
  }

  it('carregar() busca uma única vez', () => {
    carregar();
    service.carregar();
    http.expectNone(URL);
    expect(service.tipos().map((t) => t.nome)).toEqual(['Anexo geral', 'Parecer']);
  });

  it('criar() adiciona no signal em ordem alfabética', () => {
    carregar();
    service.criar('Documento').subscribe();
    http.expectOne({ url: URL, method: 'POST' }).flush({ id: 3, nome: 'Documento' });

    expect(service.tipos().map((t) => t.nome)).toEqual(['Anexo geral', 'Documento', 'Parecer']);
  });

  it('alterar() troca o item e reordena', () => {
    carregar();
    service.alterar(1, 'Zebra').subscribe();
    http.expectOne({ url: `${URL}/1`, method: 'PUT' }).flush({ id: 1, nome: 'Zebra' });

    expect(service.tipos().map((t) => t.nome)).toEqual(['Parecer', 'Zebra']);
  });

  it('excluir() remove do signal', () => {
    carregar();
    service.excluir(2).subscribe();
    http.expectOne({ url: `${URL}/2`, method: 'DELETE' }).flush(null);

    expect(service.tipos().map((t) => t.id)).toEqual([1]);
  });

  it('recarrega se a primeira busca falhou', () => {
    service.carregar();
    http.expectOne(URL).flush('erro', { status: 500, statusText: 'Server Error' });
    expect(service.tipos()).toEqual([]);

    service.carregar();
    http.expectOne(URL).flush([{ id: 1, nome: 'Anexo geral' }]);
    expect(service.tipos().length).toBe(1);
  });
});
