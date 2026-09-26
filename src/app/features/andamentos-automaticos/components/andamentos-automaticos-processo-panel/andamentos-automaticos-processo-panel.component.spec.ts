import { registerLocaleData } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import localePt from '@angular/common/locales/pt';

import { environment } from '../../../../../environments/environment';
import { andamento, painel, publicacao } from '../../services/andamentos.testing';
import { AndamentosService } from '../../services/andamentos.service';
import { AndamentosAutomaticosProcessoPanelComponent } from './andamentos-automaticos-processo-panel.component';

// As abas formatam datas em pt-BR — o app registra em `app.config.ts`.
registerLocaleData(localePt);

const URL = `${environment.apiBaseUrl}/processos/1/andamentos`;

describe('AndamentosAutomaticosProcessoPanelComponent — contador de novidades nas abas', () => {
  let fixture: ComponentFixture<AndamentosAutomaticosProcessoPanelComponent>;
  let http: HttpTestingController;

  function aba(nome: string): string {
    const botao = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('nav button')).find((b) =>
      b.textContent?.includes(nome),
    );
    return (botao?.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AndamentosAutomaticosProcessoPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AndamentosAutomaticosProcessoPanelComponent);
    fixture.componentRef.setInput('processoId', 1);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('mostra quantos andamentos e publicações novos o usuário ainda não viu', () => {
    const djen = publicacao({ chave: 'djen-9', novo: true });
    http.expectOne((r) => r.url === URL).flush(
      painel({
        andamentos: [
          andamento({ chave: 'a1', novo: true }),
          andamento({ chave: 'a2', novo: true }),
          andamento({ chave: 'a3', novo: false }),
        ],
        publicacoes: [djen],
      }),
    );
    fixture.detectChanges();

    expect(aba('Andamentos')).toBe('Andamentos (2 novos)');
    expect(aba('Publicações')).toBe('Publicações (1 nova)');

    TestBed.inject(AndamentosService).marcarVistos(1, [djen]);
    http.expectOne(`${URL}/vistos`).flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();

    expect(aba('Publicações')).toBe('Publicações');
  });

  it('sem novidades, as abas ficam só com o nome', () => {
    http.expectOne((r) => r.url === URL).flush(painel({ andamentos: [andamento({ novo: false })] }));
    fixture.detectChanges();

    expect(aba('Andamentos')).toBe('Andamentos');
    expect(aba('Publicações')).toBe('Publicações');
  });
});
