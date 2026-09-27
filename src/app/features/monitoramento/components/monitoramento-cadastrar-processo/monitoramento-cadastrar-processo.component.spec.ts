import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { DomainService } from '../../../../core/services/domain.service';
import { ToastService } from '../../../../shared/services/toast.service';
import { MonitoramentoProcessoRow, MonitoramentoService } from '../../services/monitoramento.service';
import { MonitoramentoCadastrarProcessoComponent } from './monitoramento-cadastrar-processo.component';

const CNJ = '5021365-32.2017.4.04.7000';

function linha(over: Partial<MonitoramentoProcessoRow> = {}): MonitoramentoProcessoRow {
  return {
    id: 5,
    monitoramentoId: 1,
    numeroCnj: CNJ,
    numeroCnjDigitos: '50213653220174047000',
    cliente: 'Banco Horizonte S.A.',
    contrario: 'União Federal',
    acaoId: 2,
    acao: 'Mandado de Segurança',
    statusId: 3,
    status: 'ativo',
    observacao: 'Aguardando liminar.',
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

describe('MonitoramentoCadastrarProcessoComponent', () => {
  let fixture: ComponentFixture<MonitoramentoCadastrarProcessoComponent>;
  let service: { cadastrarNoSistema: ReturnType<typeof vi.fn> };
  let toast: { sucesso: ReturnType<typeof vi.fn>; erro: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn> };
  let cadastrados: number;
  let fechou: number;

  function criar(processo: MonitoramentoProcessoRow): void {
    fixture = TestBed.createComponent(MonitoramentoCadastrarProcessoComponent);
    fixture.componentRef.setInput('processo', processo);
    cadastrados = 0;
    fechou = 0;
    fixture.componentInstance.cadastrado.subscribe(() => cadastrados++);
    fixture.componentInstance.fechar.subscribe(() => fechou++);
    fixture.detectChanges();
  }

  function comp() {
    return fixture.componentInstance as unknown as {
      cadastrar: () => void;
      onPessoa: (item: Record<string, unknown> | null) => void;
      levarObservacao: { set: (v: boolean) => void };
    };
  }

  beforeEach(() => {
    service = { cadastrarNoSistema: vi.fn(() => of('PROC-000012')) };
    toast = { sucesso: vi.fn(), erro: vi.fn(), info: vi.fn() };
    TestBed.configureTestingModule({
      imports: [MonitoramentoCadastrarProcessoComponent],
      providers: [
        { provide: MonitoramentoService, useValue: service },
        { provide: DomainService, useValue: { get: vi.fn(() => of({ content: [] })) } },
        { provide: ToastService, useValue: toast },
      ],
    });
  });

  it('cria o processo judicial com os dados do monitoramento e a pessoa escolhida como cliente', () => {
    criar(linha());
    comp().onPessoa({ id: 11, nome: 'Banco Horizonte' });

    comp().cadastrar();

    expect(service.cadastrarNoSistema).toHaveBeenCalledWith({
      tipo: 'JUDICIAL',
      numero_cnj: CNJ,
      acao_id: 2,
      status_id: 3,
      observacoes_gerais: 'Aguardando liminar.',
      clientes: [{ pessoa_id: 11, posicao_id: null, principal: true }],
      partes_contrarias: [{ nome: 'União Federal', posicao_id: null, documento: null, principal: true }],
    });
    expect(toast.sucesso).toHaveBeenCalledWith(`${CNJ} cadastrado no sistema como PROC-000012.`);
    expect(cadastrados).toBe(1);
    expect(fechou).toBe(1);
  });

  it('sem pessoa, sem contrário e sem levar a observação: listas vazias e observação nula', () => {
    criar(linha({ contrario: null }));
    comp().levarObservacao.set(false);

    comp().cadastrar();

    expect(service.cadastrarNoSistema).toHaveBeenCalledWith(
      expect.objectContaining({ clientes: [], partes_contrarias: [], observacoes_gerais: null }),
    );
  });

  it('erro no cadastro avisa e mantém o diálogo aberto', () => {
    service.cadastrarNoSistema.mockReturnValue(throwError(() => ({ status: 500 })));
    criar(linha());

    comp().cadastrar();

    expect(toast.erro).toHaveBeenCalled();
    expect(cadastrados).toBe(0);
    expect(fechou).toBe(0);
  });
});
