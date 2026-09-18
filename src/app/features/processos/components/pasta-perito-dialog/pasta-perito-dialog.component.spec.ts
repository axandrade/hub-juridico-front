import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { DocumentExplorerComponent } from '../../../documents/components/document-explorer/document-explorer.component';
import { PastaPeritoService } from '../../services/pasta-perito.service';
import { ProcessoPastaResumo } from '../../services/processo-pasta-resumo.model';
import { ProcessosPeritoComArquivosComponent } from '../processos-perito-com-arquivos/processos-perito-com-arquivos.component';
import { PastaPeritoDialogComponent } from './pasta-perito-dialog.component';

/**
 * Stub do explorador real (que puxa `DOCUMENTS_PORT`, `TransfersService`, `DomainService` etc.) —
 * só precisamos saber SE ele foi renderizado e com que `pastaInicialId`, não testar o explorador
 * em si (isso já tem cobertura própria).
 */
@Component({ selector: 'app-document-explorer', template: '' })
class StubDocumentExplorer {
  @Input() pessoaId!: number;
  @Input() pessoaNome = '';
  @Input() pastaInicialId: string | null = null;
  @Output() notify = new EventEmitter<unknown>();
}

@Component({ selector: 'app-processos-perito-com-arquivos', template: '' })
class StubProcessosComArquivos {
  @Input() peritoId!: number;
  @Input() recarregarTick = 0;
  @Output() rowOpen = new EventEmitter<ProcessoPastaResumo>();
}

function linha(over: Partial<ProcessoPastaResumo> = {}): ProcessoPastaResumo {
  return {
    processoId: 3,
    numeroProcesso: '5001234-88.2026.4.05.8100',
    pastaId: null,
    qtdPastas: 0,
    qtdDocumentos: 0,
    tamanhoTotalBytes: 0,
    ultimoEnvioEm: null,
    ...over,
  };
}

describe('PastaPeritoDialogComponent', () => {
  let fixture: ComponentFixture<PastaPeritoDialogComponent>;
  let pastaPerito: PastaPeritoService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PastaPeritoDialogComponent],
    }).overrideComponent(PastaPeritoDialogComponent, {
      remove: { imports: [DocumentExplorerComponent, ProcessosPeritoComArquivosComponent] },
      add: { imports: [StubDocumentExplorer, StubProcessosComArquivos] },
    });

    fixture = TestBed.createComponent(PastaPeritoDialogComponent);
    pastaPerito = TestBed.inject(PastaPeritoService);
  });

  function abrirDialogoEClicarNaLinha(row: ProcessoPastaResumo): void {
    pastaPerito.abrir({ id: 1, nome: 'Eng. Fabiana Rocha (perícia contábil)' });
    fixture.detectChanges();

    const tabela = fixture.debugElement.query(By.directive(StubProcessosComArquivos));
    (tabela.componentInstance as StubProcessosComArquivos).rowOpen.emit(row);
    fixture.detectChanges();
  }

  it('processo COM subpasta: abre o explorador navegado nela, não na raiz do perito', () => {
    abrirDialogoEClicarNaLinha(linha({ pastaId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', qtdPastas: 3, qtdDocumentos: 5 }));

    // Deveria renderizar o explorador, navegado direto na subpasta do processo.
    const explorador = fixture.debugElement.query(By.directive(StubDocumentExplorer));
    expect(explorador).not.toBeNull();
    expect((explorador.componentInstance as StubDocumentExplorer).pastaInicialId).toBe(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    );
  });

  it('processo SEM subpasta ainda (pastaId nulo, contagem 0/0): NÃO abre o explorador na raiz do perito', () => {
    abrirDialogoEClicarNaLinha(linha({ pastaId: null, qtdPastas: 0, qtdDocumentos: 0 }));

    // Com pastaId nulo, `pastaInicialId` viraria null e o explorador cairia na raiz do perito
    // (pastas gerais dele, sem relação com este processo) — por isso não deve renderizar.
    const explorador = fixture.debugElement.query(By.directive(StubDocumentExplorer));
    expect(explorador).toBeNull();

    const mensagemVazia = fixture.debugElement.query(By.css('.pasta-dialog__vazio'));
    expect(mensagemVazia).not.toBeNull();
  });
});
