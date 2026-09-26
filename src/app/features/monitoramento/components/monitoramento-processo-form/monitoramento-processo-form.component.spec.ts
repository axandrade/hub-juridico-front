import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { DomainService } from '../../../../core/services/domain.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { MonitoramentoProcessoRow, MonitoramentoService } from '../../services/monitoramento.service';
import { MonitoramentoProcessoFormComponent, ProcessoSalvo } from './monitoramento-processo-form.component';

const CNJ = '0017162-98.2017.5.16.0015';

function linha(over: Partial<MonitoramentoProcessoRow> = {}): MonitoramentoProcessoRow {
  return {
    id: 5,
    monitoramentoId: 1,
    numeroCnj: CNJ,
    numeroCnjDigitos: '00171629820175160015',
    cliente: 'Cliente X',
    contrario: 'Contrário Y',
    acaoId: 2,
    acao: 'Cobrança',
    statusId: 3,
    status: 'ativo',
    observacao: 'obs',
    datajud: null,
    stf: null,
    comunica: null,
    tribunal: null,
    ultimoMovimentoEm: null,
    ultimoMovimento: null,
    consultadoEm: null,
    numeroValido: true,
    situacao: 'NAO_CONSULTADO',
    processoId: null,
    processoPasta: null,
    ...over,
  };
}

describe('MonitoramentoProcessoFormComponent', () => {
  let fixture: ComponentFixture<MonitoramentoProcessoFormComponent>;
  let service: {
    adicionarProcesso: ReturnType<typeof vi.fn>;
    editarProcesso: ReturnType<typeof vi.fn>;
    processoCadastrado: ReturnType<typeof vi.fn>;
  };
  let toast: { sucesso: ReturnType<typeof vi.fn>; erro: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn> };
  let salvos: ProcessoSalvo[];
  let fechou: number;

  function criar(processo: MonitoramentoProcessoRow | null = null): void {
    fixture = TestBed.createComponent(MonitoramentoProcessoFormComponent);
    fixture.componentRef.setInput('monitoramentoId', 1);
    fixture.componentRef.setInput('processo', processo);
    salvos = [];
    fechou = 0;
    fixture.componentInstance.salvo.subscribe((s) => salvos.push(s));
    fixture.componentInstance.fechar.subscribe(() => fechou++);
    fixture.detectChanges();
  }

  function el<T extends HTMLElement>(seletor: string): T {
    return (fixture.nativeElement as HTMLElement).ownerDocument.querySelector(seletor) as T;
  }

  function digitar(seletor: string, valor: string): void {
    const campo = el<HTMLInputElement>(seletor);
    campo.value = valor;
    campo.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function comp() {
    return fixture.componentInstance as unknown as {
      numero: () => string;
      avisoCnj: () => { tom: string; texto: string };
      podeSalvar: () => boolean;
      cliente: () => string;
      salvar: (continuar: boolean) => void;
      acaoId: { set: (v: number | null) => void };
    };
  }

  beforeEach(() => {
    service = {
      adicionarProcesso: vi.fn(() => of(9)),
      editarProcesso: vi.fn(() => of(undefined)),
      processoCadastrado: vi.fn(() => of(null)),
    };
    toast = { sucesso: vi.fn(), erro: vi.fn(), info: vi.fn() };
    TestBed.configureTestingModule({
      imports: [MonitoramentoProcessoFormComponent],
      providers: [
        { provide: MonitoramentoService, useValue: service },
        { provide: DomainService, useValue: { get: vi.fn(() => of({ content: [] })) } },
        { provide: ToastService, useValue: toast },
      ],
    });
  });

  it('põe a máscara enquanto digita e confere o dígito verificador', () => {
    criar();

    digitar('.mp-form__cnj', '0017162981');
    expect(comp().numero()).toBe('0017162-98.1');
    expect(comp().avisoCnj().texto).toContain('Faltam');

    digitar('.mp-form__cnj', '00171620020175160015');
    expect(comp().numero()).toBe('0017162-00.2017.5.16.0015');
    expect(comp().avisoCnj().tom).toBe('erro');

    digitar('.mp-form__cnj', '00171629820175160015');
    expect(comp().avisoCnj().tom).toBe('ok');
    expect(comp().avisoCnj().texto).toContain('Justiça do Trabalho');
  });

  it('só salva com número válido e cliente preenchido', () => {
    criar();
    digitar('.mp-form__cnj', CNJ);
    expect(comp().podeSalvar()).toBe(false);

    digitar('input[placeholder="Nome do cliente"]', '  Cliente X ');
    expect(comp().podeSalvar()).toBe(true);
  });

  it('adiciona com o corpo do ddd-noap (snake_case) e pede a consulta das fontes', () => {
    criar();
    digitar('.mp-form__cnj', CNJ);
    digitar('input[placeholder="Nome do cliente"]', '  Cliente X ');
    comp().acaoId.set(2);

    comp().salvar(false);

    expect(service.adicionarProcesso).toHaveBeenCalledWith({
      monitoramento_id: 1,
      numero_cnj: CNJ,
      cliente: 'Cliente X',
      contrario: null,
      acao_id: 2,
      status_id: null,
      observacao: null,
    });
    expect(salvos).toEqual([{ id: 9, numeroCnj: CNJ, consultarFontes: true }]);
    expect(fechou).toBe(1);
  });

  it('"Salvar e adicionar outro" limpa o número e mantém o cliente', () => {
    criar();
    digitar('.mp-form__cnj', CNJ);
    digitar('input[placeholder="Nome do cliente"]', 'Cliente X');

    comp().salvar(true);
    fixture.detectChanges();

    expect(fechou).toBe(0);
    expect(comp().numero()).toBe('');
    expect(comp().cliente()).toBe('Cliente X');
    expect(el<HTMLElement>('.mp-form__adicionados').textContent).toContain(CNJ);
  });

  it('edita pelo PATCH, sem consultar as fontes de novo', () => {
    criar(linha());

    comp().salvar(false);

    expect(service.editarProcesso).toHaveBeenCalledWith(5, expect.objectContaining({ numero_cnj: CNJ, acao_id: 2, status_id: 3 }));
    expect(service.adicionarProcesso).not.toHaveBeenCalled();
    expect(salvos).toEqual([{ id: 5, numeroCnj: CNJ, consultarFontes: false }]);
  });

  it('mostra o erro do backend (ex.: número repetido no monitoramento)', () => {
    service.adicionarProcesso.mockReturnValue(
      throwError(() => ({ status: 409, error: { detail: 'Este processo já está neste monitoramento.' } })),
    );
    criar();
    digitar('.mp-form__cnj', CNJ);
    digitar('input[placeholder="Nome do cliente"]', 'Cliente X');

    comp().salvar(false);

    expect(toast.erro).toHaveBeenCalledWith('Não foi possível salvar: Este processo já está neste monitoramento.');
    expect(fechou).toBe(0);
  });

  it('oferece os dados do processo já cadastrado com o mesmo número', () => {
    service.processoCadastrado.mockReturnValue(
      of({ id: 6, numeroCnj: CNJ, clientePrincipalNome: 'Cliente do Cadastro', contrarioPrincipalNome: 'Réu' }),
    );
    criar();
    digitar('.mp-form__cnj', CNJ);

    expect(service.processoCadastrado).toHaveBeenCalledWith(CNJ);
    (el<HTMLElement>('.mp-form__cadastrado app-button button') ?? el<HTMLElement>('.mp-form__cadastrado button')).click();
    fixture.detectChanges();

    expect(comp().cliente()).toBe('Cliente do Cadastro');
  });
});
