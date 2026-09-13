import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { of } from 'rxjs';

import { AcaoProcessoService } from '../../services/acao-processo.service';
import { CidadeService } from '../../services/cidade-service';
import { FaseProcessoService } from '../../services/fase-processo.service';
import { NaturezaProcessoService } from '../../services/natureza-processo.service';
import { OrgaoJulgadorService } from '../../services/orgao-julgador.service';
import { PosicaoClienteService } from '../../services/posicao-cliente.service';
import { ProcedimentoProcessoService } from '../../services/procedimento-processo.service';
import { ProcessoApi } from '../../services/processo-api.model';
import { ProcessoService } from '../../services/processo-service';
import { StatusProcessoService } from '../../services/status-processo.service';
import { TribunalService } from '../../services/tribunal.service';
import { ProcessoDadosGeraisComponent } from './processo-dados-gerais.component';

/**
 * Ficha mínima válida — só os campos usados por `carregar`/`coletar` nesta suíte precisam de valor
 * "real"; o resto fica com o vazio de sempre pra não acionar os pickers de cliente/advogado/cidade.
 */
function makeProcesso(over: Partial<ProcessoApi> = {}): ProcessoApi {
  return {
    id: 3,
    favorito: false,
    tipo: 'JUDICIAL',
    numero_cnj: '5001234-88.2026.4.05.8100',
    status: 'ativo',
    pasta: 'PROC-000003',
    cliente_principal_id: null,
    cliente_principal_posicao: null,
    contrario_principal_nome: null,
    contrario_principal_posicao: null,
    contrario_principal_documento: null,
    advogado_responsavel_id: null,
    data_distribuicao: null,
    acao: null,
    natureza: null,
    procedimento: null,
    fase: null,
    uf: null,
    cidade: null,
    cidade_id: null,
    observacoes_gerais: null,
    destacar_observacao: false,
    objeto_principal: null,
    observacoes_objeto: null,
    valor_pedido: null,
    valor_deferido: null,
    cenario_provavel: { valor: null, percentual: null, provisionar: true },
    cenario_possivel: { valor: null, percentual: null, provisionar: true },
    cenario_remoto: { valor: null, percentual: null, provisionar: true },
    objetos_secundarios: [],
    clientes_secundarios: [],
    partes_contrarias: [],
    outros_envolvidos_advogados: [],
    outros_envolvidos_magistrados: [],
    outros_envolvidos_testemunhas: [],
    outros_envolvidos_peritos: [],
    outros_envolvidos_assistentes_tecnicos: [],
    tribunal_atual: null,
    orgao_processante: null,
    escritorios_anteriores: [],
    tags: [],
    observacoes_previas: [],
    tribunais_historico: [],
    ativo: true,
    atualizado_em: null,
    ...over,
  };
}

describe('ProcessoDadosGeraisComponent — tribunal/órgão atuais (carregar/coletar)', () => {
  let fixture: ComponentFixture<ProcessoDadosGeraisComponent>;

  // Catálogo com um tribunal "de único órgão" (STF) e um tribunal novo sem nenhum órgão
  // cadastrado (TESTE-B) — cobre os dois cenários que o usuário pediu pra testar.
  const tribunaisCatalogo = [
    { id: 1, nome: 'STF' },
    { id: 41, nome: 'TESTE-B' },
  ];
  const orgaosCatalogo = [
    { id: 42, nome: 'STF - Supremo Tribunal Federal', tribunal_id: 1 },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ProcessoDadosGeraisComponent],
      providers: [
        provideHttpClient(),
        {
          provide: ProcessoService,
          useValue: {
            buscarPessoas: () => of({ itens: [], ultima: true }),
            buscarAdvogados: () => of({ itens: [], ultima: true }),
            rotuloPessoa: () => of(''),
            rotuloAdvogado: () => of(''),
          },
        },
        { provide: StatusProcessoService, useValue: { carregar: () => {}, status: () => [] } },
        { provide: PosicaoClienteService, useValue: { carregar: () => {}, posicoes: () => [] } },
        { provide: AcaoProcessoService, useValue: { carregar: () => {}, acoes: () => [] } },
        { provide: NaturezaProcessoService, useValue: { carregar: () => {}, naturezas: () => [] } },
        { provide: ProcedimentoProcessoService, useValue: { carregar: () => {}, procedimentos: () => [] } },
        { provide: FaseProcessoService, useValue: { carregar: () => {}, fases: () => [] } },
        { provide: CidadeService, useValue: { buscarPagina: () => of({ itens: [], ultima: true }), resolver: () => of('') } },
        { provide: TribunalService, useValue: { carregar: () => {}, tribunais: () => tribunaisCatalogo } },
        { provide: OrgaoJulgadorService, useValue: { carregar: () => {}, recarregar: () => {}, orgaos: () => orgaosCatalogo } },
      ],
    });
    fixture = TestBed.createComponent(ProcessoDadosGeraisComponent);
    fixture.detectChanges();
  });

  /** Lê o `<input>` do combobox pelo `aria-label` (mesmo truque de `client-form.component.spec.ts`). */
  function valorExibido(ariaLabel: string): string {
    const input = fixture.nativeElement.querySelector(
      `input[aria-label="${ariaLabel}"]`,
    ) as HTMLInputElement | null;
    return input?.value ?? '';
  }

  it('com órgão: carrega tribunal+órgão e exibe os dois combobox preenchidos', () => {
    fixture.componentInstance.carregar(
      makeProcesso({
        tribunal_atual: { id: 1, nome: 'STF' },
        orgao_processante: { id: 42, nome: 'STF - Supremo Tribunal Federal', tribunal_id: 1 },
      }),
    );
    fixture.detectChanges();

    expect(valorExibido('Tribunal')).toBe('STF');
    expect(valorExibido('Órgão do tribunal escolhido')).toBe('Supremo Tribunal Federal');

    // Salvar de novo sem tocar nos combobox tem que reenviar o mesmo par.
    const coletado = fixture.componentInstance.coletar();
    expect(coletado.tribunalAtualId).toBe(1);
    expect(coletado.orgaoProcessanteId).toBe(42);
  });

  it('sem órgão: tribunal novo (sem nenhum órgão cadastrado) persiste sozinho — não fica em branco', () => {
    fixture.componentInstance.carregar(
      makeProcesso({
        tribunal_atual: { id: 41, nome: 'TESTE-B' },
        orgao_processante: null,
      }),
    );
    fixture.detectChanges();

    expect(valorExibido('Tribunal')).toBe('TESTE-B');
    expect(valorExibido('Órgão do tribunal escolhido')).toBe('— Sem órgão —');

    // Regressão do bug original: reenviar o coletado precisa manter o tribunal, não perdê-lo.
    const coletado = fixture.componentInstance.coletar();
    expect(coletado.tribunalAtualId).toBe(41);
    expect(coletado.orgaoProcessanteId).toBeNull();
  });

  it('sem tribunal nenhum: os dois combobox ficam vazios', () => {
    fixture.componentInstance.carregar(makeProcesso());
    fixture.detectChanges();

    expect(valorExibido('Tribunal')).toBe('— Sem tribunal —');
    expect(valorExibido('Órgão do tribunal escolhido')).toBe('— Sem órgão —');

    const coletado = fixture.componentInstance.coletar();
    expect(coletado.tribunalAtualId).toBeNull();
    expect(coletado.orgaoProcessanteId).toBeNull();
  });
});
