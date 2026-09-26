import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { environment } from '../../../../../environments/environment';
import { andamento, painel, publicacao } from '../../services/andamentos.testing';
import { AndamentosService } from '../../services/andamentos.service';
import { AndamentosListaPublicacoesComponent } from './andamentos-lista-publicacoes.component';

const URL = `${environment.apiBaseUrl}/processos/1/andamentos`;

describe('AndamentosListaPublicacoesComponent — novidades', () => {
  let fixture: ComponentFixture<AndamentosListaPublicacoesComponent>;
  let http: HttpTestingController;
  let el: HTMLElement;

  const DJEN_NOVA = publicacao({ ordem: 2, id: 2, documento: 'Intimação nova', chave: 'djen-2', novo: true });
  const DJEN_VELHA = publicacao({ ordem: 1, id: 1, documento: 'Despacho antigo', chave: 'djen-1', novo: false });
  const MESMA_NA_LINHA_DO_TEMPO = andamento({ chave: 'djen-2', novo: true, fonte: 'Comunica/DJEN' });

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AndamentosListaPublicacoesComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AndamentosListaPublicacoesComponent);
    fixture.componentRef.setInput('processoId', 1);
    el = fixture.nativeElement;
    fixture.detectChanges();
    http
      .expectOne((r) => r.url === URL)
      .flush(painel({ andamentos: [MESMA_NA_LINHA_DO_TEMPO], publicacoes: [DJEN_NOVA, DJEN_VELHA] }));
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function linha(texto: string): HTMLTableRowElement {
    const tr = Array.from(el.querySelectorAll<HTMLTableRowElement>('tbody tr')).find((l) =>
      l.textContent?.includes(texto),
    );
    expect(tr, `linha "${texto}"`).toBeTruthy();
    return tr!;
  }

  it('publicação nova fica em negrito e o total aparece com o botão de marcar todas', () => {
    expect(linha('Intimação nova').classList).toContain('is-novo');
    expect(linha('Despacho antigo').classList).not.toContain('is-novo');
    expect(el.textContent).toContain('1 publicação(ões) nova(s)');
  });

  it('selecionar a publicação só mostra o detalhe — não marca como vista', () => {
    linha('Intimação nova').click();
    fixture.detectChanges();

    http.expectNone(`${URL}/vistos`);
    expect(linha('Intimação nova').classList).toContain('is-novo');
  });

  it('"Marcar como vista" confirmado tira do negrito — e da aba Andamentos também', () => {
    expect(linha('Despacho antigo').querySelector('.data-table__action-button')).toBeNull();
    linha('Intimação nova').querySelector<HTMLButtonElement>('.data-table__action-button')!.click();
    fixture.detectChanges();
    http.expectNone(`${URL}/vistos`);
    Array.from(el.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'))
      .find((b) => b.textContent?.includes('Marcar como vista'))!
      .click();
    fixture.detectChanges();

    const req = http.expectOne(`${URL}/vistos`);
    expect(req.request.body).toEqual({ chaves: ['djen-2'] });
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(linha('Intimação nova').classList).not.toContain('is-novo');
    expect(el.textContent).not.toContain('publicação(ões) nova(s)');
    expect(TestBed.inject(AndamentosService).ehNovo(1, MESMA_NA_LINHA_DO_TEMPO)).toBe(false);
  });

  it('"Marcar todos como vistos" limpa as novidades', () => {
    Array.from(el.querySelectorAll<HTMLButtonElement>('button'))
      .find((b) => b.textContent?.includes('Marcar todos como vistos'))!
      .click();
    fixture.detectChanges();

    expect(http.expectOne(`${URL}/vistos`).request.body).toEqual({ todos: true });
    expect(linha('Intimação nova').classList).not.toContain('is-novo');
  });
});
