import { Component, Output, EventEmitter, forwardRef, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { ToastService } from '../../../../shared/services/toast.service';
import { ProcessoApi } from '../../services/processo-api.model';
import { ProcessoService } from '../../services/processo-service';
import { ProcessoDadosGeraisComponent } from '../processo-dados-gerais/processo-dados-gerais.component';
import { ProcessoObjetoComponent } from '../processo-objeto/processo-objeto.component';
import { ProcessoOutrosEnvolvidosComponent } from '../processo-outros-envolvidos/processo-outros-envolvidos.component';
import { ProcessoFormComponent } from './processo-form.component';

/**
 * Stubs das 3 abas — só precisamos de `carregar`/`limpar`/`coletar` existindo (chamados pelo
 * shell), não do comportamento real delas (que já tem cobertura própria e puxa serviços/catálogos
 * que não interessam aqui).
 */
// `ProcessoFormComponent` acessa as abas via `viewChild(TipoReal)` (busca por tipo, não por
// seletor) — sem o `providers: [{ provide: <tipo real>, useExisting: <stub> }]` abaixo, o
// viewChild nunca resolveria a stub e o efeito que carrega o processo nem rodaria.
@Component({
  selector: 'app-processo-dados-gerais',
  template: '',
  providers: [{ provide: ProcessoDadosGeraisComponent, useExisting: forwardRef(() => StubDadosGerais) }],
})
class StubDadosGerais {
  @Output() erro = new EventEmitter<string>();
  readonly numeroValue = signal('');
  carregar(_p: ProcessoApi): void {}
  limpar(): void {}
  validar() {
    return { ok: true as const };
  }
  coletar() {
    return {} as Record<string, unknown>;
  }
}

@Component({
  selector: 'app-processo-outros-envolvidos',
  template: '',
  providers: [{ provide: ProcessoOutrosEnvolvidosComponent, useExisting: forwardRef(() => StubOutrosEnvolvidos) }],
})
class StubOutrosEnvolvidos {
  @Output() erro = new EventEmitter<string>();
  carregar(_p: ProcessoApi): void {}
  limpar(): void {}
  coletar() {
    return {} as Record<string, unknown>;
  }
}

@Component({
  selector: 'app-processo-objeto',
  template: '',
  providers: [{ provide: ProcessoObjetoComponent, useExisting: forwardRef(() => StubObjeto) }],
})
class StubObjeto {
  @Output() erro = new EventEmitter<string>();
  carregar(_p: ProcessoApi): void {}
  limpar(): void {}
  coletar() {
    return {} as Record<string, unknown>;
  }
}

function processo(over: Partial<ProcessoApi> = {}): ProcessoApi {
  return {
    id: 1,
    favorito: false,
    ativo: true,
    pasta: 'PROC-000001',
    numero_cnj: null,
    ...over,
  } as ProcessoApi;
}

describe('ProcessoFormComponent — aba selecionada ao trocar de processo', () => {
  let fixture: ComponentFixture<ProcessoFormComponent>;
  let component: ProcessoFormComponent;
  let buscarCompletoSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    buscarCompletoSpy = vi.fn((id: number) => of(processo({ id })));

    TestBed.configureTestingModule({
      imports: [ProcessoFormComponent],
      providers: [
        {
          provide: ProcessoService,
          useValue: {
            buscarCompleto: buscarCompletoSpy,
            alternarFavorito: vi.fn(),
            salvar: vi.fn(),
            alterarStatus: vi.fn(),
          },
        },
        { provide: ToastService, useValue: { sucesso: vi.fn(), erro: vi.fn(), info: vi.fn() } },
      ],
    }).overrideComponent(ProcessoFormComponent, {
      remove: {
        imports: [ProcessoDadosGeraisComponent, ProcessoOutrosEnvolvidosComponent, ProcessoObjetoComponent],
      },
      add: { imports: [StubDadosGerais, StubOutrosEnvolvidos, StubObjeto] },
    });

    fixture = TestBed.createComponent(ProcessoFormComponent);
    component = fixture.componentInstance;
  });

  it('trocar de processo (linha A -> linha B na tabela) mantém a aba que o usuário selecionou', () => {
    fixture.componentRef.setInput('processoId', 1);
    fixture.detectChanges();

    (component as any).trocarAba('outrosEnvolvidos');
    expect((component as any).abaAtiva()).toBe('outrosEnvolvidos');

    fixture.componentRef.setInput('processoId', 2);
    fixture.detectChanges();

    expect(buscarCompletoSpy).toHaveBeenCalledWith(2);
    expect((component as any).abaAtiva()).toBe('outrosEnvolvidos');
  });

  it('limpar o painel (processoId null) volta pra "Dados gerais"', () => {
    fixture.componentRef.setInput('processoId', 1);
    fixture.detectChanges();
    (component as any).trocarAba('objeto');
    expect((component as any).abaAtiva()).toBe('objeto');

    fixture.componentRef.setInput('processoId', null);
    fixture.detectChanges();

    expect((component as any).abaAtiva()).toBe('gerais');
  });

  it('clicar em "Limpar painel" volta pra "Dados gerais"', () => {
    fixture.componentRef.setInput('processoId', 1);
    fixture.detectChanges();
    (component as any).trocarAba('outrosEnvolvidos');

    (component as any).clearPanel();

    expect((component as any).abaAtiva()).toBe('gerais');
  });
});
