import { registerLocaleData } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import localePt from '@angular/common/locales/pt';

import { environment } from '../../../../../environments/environment';
import { AndamentosProcessoApi } from '../../services/andamentos.service';
import { andamento, painel } from '../../services/andamentos.testing';
import { AndamentosListaAndamentosComponent } from './andamentos-lista-andamentos.component';

// A coluna de data formata em pt-BR — o app registra em `app.config.ts`.
registerLocaleData(localePt);

const URL = `${environment.apiBaseUrl}/processos/1/andamentos`;

describe('AndamentosListaAndamentosComponent — novidades', () => {
  let fixture: ComponentFixture<AndamentosListaAndamentosComponent>;
  let http: HttpTestingController;
  let el: HTMLElement;

  const RESPOSTA: AndamentosProcessoApi = painel({
    andamentos: [
      andamento({ ordem: 2, nome: 'Conclusão', chave: 'novo-1', novo: true }),
      andamento({ ordem: 1, nome: 'Distribuição', chave: 'velho-1', novo: false }),
    ],
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AndamentosListaAndamentosComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AndamentosListaAndamentosComponent);
    fixture.componentRef.setInput('processoId', 1);
    el = fixture.nativeElement;
    fixture.detectChanges();
    http.expectOne((r) => r.url === URL).flush(RESPOSTA);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function linhas(): HTMLTableRowElement[] {
    return Array.from(el.querySelectorAll<HTMLTableRowElement>('tbody tr')).filter(
      (tr) => !tr.classList.contains('data-table__state'),
    );
  }

  function linha(nome: string): HTMLTableRowElement {
    const tr = linhas().find((l) => l.textContent?.includes(nome));
    expect(tr, `linha "${nome}"`).toBeTruthy();
    return tr!;
  }

  function botao(texto: string): HTMLButtonElement | undefined {
    return Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent?.includes(texto));
  }

  it('só a novidade não vista fica em negrito', () => {
    expect(linha('Conclusão').classList).toContain('is-novo');
    expect(linha('Distribuição').classList).not.toContain('is-novo');
    expect(el.textContent).toContain('1 novo(s)');
  });

  it('clicar na linha marca como visto e tira o negrito', () => {
    linha('Conclusão').click();
    fixture.detectChanges();

    const req = http.expectOne(`${URL}/vistos`);
    expect(req.request.body).toEqual({ chaves: ['novo-1'] });
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(linha('Conclusão').classList).not.toContain('is-novo');
    expect(botao('Marcar todos como vistos')).toBeUndefined();
  });

  it('clicar numa linha que não é novidade não chama o backend', () => {
    linha('Distribuição').click();
    fixture.detectChanges();

    http.expectNone(`${URL}/vistos`);
  });

  it('"Somente novos" mostra só as novidades não vistas', () => {
    const check = Array.from(el.querySelectorAll<HTMLLabelElement>('label'))
      .find((l) => l.textContent?.includes('Somente novos'))!
      .querySelector('input')!;
    expect(check.disabled).toBe(false);

    check.checked = true;
    check.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(linhas().map((l) => l.textContent)).toEqual([expect.stringContaining('Conclusão')]);
  });

  it('"Marcar todos como vistos" tira todos do negrito e some', () => {
    botao('Marcar todos como vistos')!.click();
    fixture.detectChanges();

    const req = http.expectOne(`${URL}/vistos`);
    expect(req.request.body).toEqual({ todos: true });
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(linhas().some((l) => l.classList.contains('is-novo'))).toBe(false);
    expect(botao('Marcar todos como vistos')).toBeUndefined();
  });
});
