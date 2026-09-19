import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { PastaClienteService } from '../../../clients/services/pasta-cliente.service';
import { ProcessoService } from '../../services/processo-service';
import { ProcessoClientesComponent } from './processo-clientes.component';

interface Linha {
  pessoaId: number;
  pessoaNome: string;
  posicaoId: number | null;
  posicaoNome: string;
  principal: boolean;
}

/** Métodos `protected` — só o teste precisa driblar isso. */
type TestAccess = {
  linhas: () => Linha[];
  selecionado: () => number;
  modoEdicao: () => boolean;
  onClienteSelected: (item: Record<string, unknown> | null) => void;
  onPosicaoSelected: (item: Record<string, unknown> | null) => void;
  confirmar: () => void;
  selecionar: (indice: number) => void;
  remover: () => void;
};

function access(component: ProcessoClientesComponent): TestAccess {
  return component as unknown as TestAccess;
}

/**
 * Cobre a UX de editar cliente/posição de uma linha já adicionada (2026-09-19): selecionar a
 * linha (mesmo clique que já existia pra "Remover") pré-preenche o mini-formulário e vira modo de
 * edição — o botão único passa de "Adicionar" pra "Salvar", sem nenhum controle novo na tela.
 */
describe('ProcessoClientesComponent — editar cliente/posição de uma linha existente', () => {
  let fixture: ComponentFixture<ProcessoClientesComponent>;
  let component: TestAccess;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ProcessoClientesComponent],
      providers: [
        {
          provide: ProcessoService,
          useValue: {
            criarCatalogo: () => of({ id: 99, nome: 'Nova posição' }),
            rotuloPessoa: () => of(''),
            rotuloPosicaoCliente: () => of(''),
          },
        },
        { provide: PastaClienteService, useValue: { definirCliente: () => {}, abrir: () => {} } },
      ],
    });
    fixture = TestBed.createComponent(ProcessoClientesComponent);
    component = access(fixture.componentInstance);
    fixture.detectChanges();
  });

  function adicionarLinha(pessoaId: number, pessoaNome: string, posicaoId: number, posicaoNome: string): void {
    component.onClienteSelected({ id: pessoaId, nome: pessoaNome });
    component.onPosicaoSelected({ id: posicaoId, nome: posicaoNome });
    component.confirmar();
  }

  it('sem seleção, confirmar() adiciona uma linha nova (modo padrão)', () => {
    adicionarLinha(1, 'Ana', 10, 'Autor');

    expect(component.linhas()).toEqual([
      { pessoaId: 1, pessoaNome: 'Ana', posicaoId: 10, posicaoNome: 'Autor', principal: true },
    ]);
    expect(component.modoEdicao()).toBe(false);
  });

  it('selecionar uma linha pré-preenche o mini-formulário e liga o modo de edição', () => {
    adicionarLinha(1, 'Ana', 10, 'Autor');

    component.selecionar(0);

    expect(component.modoEdicao()).toBe(true);
    const el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    expect(el.textContent).toContain('Salvar');
  });

  it('confirmar() em modo de edição atualiza a posição da linha selecionada, sem duplicar nem mudar a ordem', () => {
    adicionarLinha(1, 'Ana', 10, 'Autor');
    adicionarLinha(2, 'Bruno', 10, 'Autor');

    component.selecionar(0);
    component.onPosicaoSelected({ id: 20, nome: 'Réu' });
    component.confirmar();

    expect(component.linhas()).toEqual([
      { pessoaId: 1, pessoaNome: 'Ana', posicaoId: 20, posicaoNome: 'Réu', principal: true },
      { pessoaId: 2, pessoaNome: 'Bruno', posicaoId: 10, posicaoNome: 'Autor', principal: false },
    ]);
    expect(component.selecionado()).toBe(-1);
    expect(component.modoEdicao()).toBe(false);
  });

  it('clicar na mesma linha de novo desmarca e limpa o rascunho (volta pro modo "Adicionar")', () => {
    adicionarLinha(1, 'Ana', 10, 'Autor');

    component.selecionar(0);
    expect(component.modoEdicao()).toBe(true);

    component.selecionar(0);
    expect(component.modoEdicao()).toBe(false);

    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Adicionar');
  });

  it('trocar de linha selecionada repõe o rascunho com os dados da nova linha', () => {
    adicionarLinha(1, 'Ana', 10, 'Autor');
    adicionarLinha(2, 'Bruno', 20, 'Réu');

    component.selecionar(0);
    component.selecionar(1);
    component.confirmar(); // salva sem mudar nada — confirma que pegou os dados de Bruno, não de Ana

    expect(component.linhas()[1]).toEqual({
      pessoaId: 2,
      pessoaNome: 'Bruno',
      posicaoId: 20,
      posicaoNome: 'Réu',
      principal: false,
    });
  });

  it('editando, a checagem de duplicidade ignora a própria linha mas ainda bloqueia colidir com outra', () => {
    adicionarLinha(1, 'Ana', 10, 'Autor');
    adicionarLinha(2, 'Bruno', 20, 'Réu');
    const erros: string[] = [];
    fixture.componentInstance.erro.subscribe((msg) => erros.push(msg));

    // Seleciona Ana e "edita" mantendo o mesmo cliente (Ana) — não deve disparar erro de duplicidade.
    component.selecionar(0);
    component.onClienteSelected({ id: 1, nome: 'Ana' });
    component.confirmar();
    expect(erros).toEqual([]);
    expect(component.linhas()[0].pessoaId).toBe(1);

    // Seleciona Ana de novo e tenta trocar pra Bruno (que já está na linha 1) — deve bloquear.
    component.selecionar(0);
    component.onClienteSelected({ id: 2, nome: 'Bruno' });
    component.confirmar();
    expect(erros).toEqual(['Bruno já está na lista.']);
    expect(component.linhas()[0].pessoaId).toBe(1); // não mudou
  });

  it('remover() enquanto uma linha está selecionada também limpa o rascunho', () => {
    adicionarLinha(1, 'Ana', 10, 'Autor');

    component.selecionar(0);
    component.remover();

    expect(component.linhas()).toEqual([]);
    expect(component.modoEdicao()).toBe(false);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Adicionar');
  });
});
