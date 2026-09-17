import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { MagistradoProcessosComArquivosService } from '../../services/magistrado-processos-com-arquivos.service';
import { ProcessoPastaResumo } from '../../services/processo-pasta-resumo.model';
import { ProcessosMagistradoComArquivosComponent } from './processos-magistrado-com-arquivos.component';

// A coluna "Último envio" usa DateFormatPipe (locale pt-BR) — sem isso, `detectChanges()` com
// itens() populado (renderiza a tabela inteira) quebra com NG0701 ao formatar a data.
registerLocaleData(localePt);

function linha(over: Partial<ProcessoPastaResumo> = {}): ProcessoPastaResumo {
  return {
    processoId: 1,
    numeroProcesso: '0801234-56.2026.5.07.0001',
    pastaId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    qtdPastas: 1,
    qtdDocumentos: 2,
    tamanhoTotalBytes: 3000,
    ultimoEnvioEm: new Date('2026-09-17T19:48:28.918411Z'),
    ...over,
  };
}

/** Coluna "Conteúdo" formata `qtdDocumentos`/`qtdPastas` — é a origem do "0 arquivos · 0 pastas" da UI. */
function colunaConteudo(component: ProcessosMagistradoComArquivosComponent) {
  const coluna = (component as any).columns.find((c: { key: string }) => c.key === 'conteudo');
  return (row: ProcessoPastaResumo) => coluna.formatter(undefined, row);
}

describe('ProcessosMagistradoComArquivosComponent', () => {
  let fixture: ComponentFixture<ProcessosMagistradoComArquivosComponent>;
  let component: ProcessosMagistradoComArquivosComponent;
  let listarSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    listarSpy = vi.fn(() => of([]));

    TestBed.configureTestingModule({
      imports: [ProcessosMagistradoComArquivosComponent],
      providers: [{ provide: MagistradoProcessosComArquivosService, useValue: { listar: listarSpy } }],
    });

    fixture = TestBed.createComponent(ProcessosMagistradoComArquivosComponent);
    component = fixture.componentInstance;
    // `magistradoId` é required — precisa de valor antes de qualquer `detectChanges()`.
    fixture.componentRef.setInput('magistradoId', 9);
  });

  it('busca a lista do magistrado do input assim que criado', () => {
    fixture.detectChanges();

    expect(listarSpy).toHaveBeenCalledWith(9);
  });

  it('popula itens() com exatamente o que o serviço devolveu, sem recalcular contagem nenhuma', () => {
    const resposta = [linha({ processoId: 1, qtdDocumentos: 2, qtdPastas: 1 }), linha({ processoId: 2, qtdDocumentos: 0, qtdPastas: 0 })];
    listarSpy.mockReturnValue(of(resposta));

    fixture.detectChanges();

    expect((component as any).itens()).toEqual(resposta);
  });

  it('recarregarTick mudando dispara nova busca (mesmo magistradoId)', () => {
    fixture.componentRef.setInput('recarregarTick', 0);
    fixture.detectChanges();
    expect(listarSpy).toHaveBeenCalledTimes(1);

    fixture.componentRef.setInput('recarregarTick', 1);
    fixture.detectChanges();
    expect(listarSpy).toHaveBeenCalledTimes(2);
  });

  describe('coluna "Conteúdo" — texto exibido pra contagem de pastas/arquivos', () => {
    it('zero pastas e zero arquivos: "0 arquivos · 0 pastas" (o caso da captura de tela do usuário)', () => {
      fixture.detectChanges();
      const formatar = colunaConteudo(component);

      expect(formatar(linha({ qtdDocumentos: 0, qtdPastas: 0 }))).toBe('0 arquivos · 0 pastas');
    });

    it('singular exato quando a contagem é 1', () => {
      fixture.detectChanges();
      const formatar = colunaConteudo(component);

      expect(formatar(linha({ qtdDocumentos: 1, qtdPastas: 1 }))).toBe('1 arquivo · 1 pasta');
    });

    it('plural quando a contagem é maior que 1, refletindo os números reais da linha', () => {
      fixture.detectChanges();
      const formatar = colunaConteudo(component);

      expect(formatar(linha({ qtdDocumentos: 7, qtdPastas: 3 }))).toBe('7 arquivos · 3 pastas');
    });

    it('arquivos e pastas são contados de forma independente (1 arquivo, várias pastas)', () => {
      fixture.detectChanges();
      const formatar = colunaConteudo(component);

      expect(formatar(linha({ qtdDocumentos: 1, qtdPastas: 4 }))).toBe('1 arquivo · 4 pastas');
    });
  });
});
