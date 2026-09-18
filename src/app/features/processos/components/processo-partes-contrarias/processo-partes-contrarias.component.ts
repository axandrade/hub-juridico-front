import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';

import { documentoValidator, onlyDigits } from '../../../../core/auth/documentos-br';
import { ComboEdicao } from '../../../../shared/components/combobox/combobox.component';
import { DomainModelDropdownComponent } from '../../../../shared/components/domain-dropdown/domain-model-dropdown.component';
import { DocumentoMaskDirective } from '../../../../shared/directives/documento-mask.directive';
import { ParteContrariaApi } from '../../services/processo-api.model';
import { ProcessoService } from '../../services/processo-service';

/** Item de um catálogo simples (`id`, `nome`) — `posicao-cliente`, via `/domain`. */
interface CatalogoItem {
  id: number;
  nome: string;
}

/** Uma linha da lista, já com o nome da posição resolvido pra exibição. */
interface ParteContrariaLinha {
  nome: string;
  posicaoId: number | null;
  posicaoNome: string;
  documento: string;
  principal: boolean;
}

/**
 * Lista de partes contrárias do processo, dentro da aba "Dados gerais"
 * (`app-processo-dados-gerais`). Mesmo padrão de `ProcessoClientesComponent`
 * (mini-form + Adicionar/Remover + listbox de seleção + estrela de "principal", que também move a
 * linha pro topo) — a diferença é que parte contrária não é uma entidade (`Pessoa`): nome e
 * documento (CPF ou CNPJ opcional) são texto livre, sem vínculo com o cadastro.
 *
 * A posição de cada item é o catálogo `posicao_cliente` (mesmo de `ClienteProcessoApi`); ao
 * contrário do dropdown de posição em `ProcessoClientesComponent` (só "Adicionar"), este aqui
 * também oferece Editar/Excluir — `aoEditarPosicao`/`aoExcluirPosicao` só repassam o evento, quem
 * chama a API e propaga pra este componente E pro `ProcessoClientesComponent` é o pai (ver
 * `ProcessoDadosGeraisComponent.renomearPosicaoCliente`/`excluirPosicaoCliente`).
 */
@Component({
  selector: 'app-processo-partes-contrarias',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, DomainModelDropdownComponent, DocumentoMaskDirective],
  templateUrl: './processo-partes-contrarias.component.html',
  styleUrl: './processo-partes-contrarias.component.scss',
})
export class ProcessoPartesContrariasComponent {
  private readonly processoService = inject(ProcessoService);

  /** Erro de validação — o pai repassa pro rodapé do shell. */
  readonly erro = output<string>();
  /** Proxy do "Editar"/"Excluir" do dropdown de posição — ver doc da classe. */
  readonly aoEditarPosicao = output<ComboEdicao>();
  readonly aoExcluirPosicao = output<string>();

  protected readonly rotuloCatalogo = (item: Record<string, unknown>): string => String(item['nome'] ?? '');

  protected readonly linhas = signal<ParteContrariaLinha[]>([]);
  /** Índice selecionado na lista (`-1` = nenhum) — igual ao listbox de Magistrados em "Outros envolvidos". */
  protected readonly selecionado = signal(-1);

  protected readonly form: FormGroup<{ nome: FormControl<string>; documento: FormControl<string> }> = new FormGroup({
    nome: new FormControl('', { nonNullable: true }),
    documento: new FormControl('', { nonNullable: true, validators: [documentoValidator] }),
  });

  protected readonly posicaoAtual = signal<CatalogoItem | null>(null);
  protected readonly posicaoValor = computed(() => {
    const p = this.posicaoAtual();
    return p ? String(p.id) : '';
  });

  protected onPosicaoSelected(item: Record<string, unknown> | null): void {
    this.posicaoAtual.set(item ? { id: Number(item['id']), nome: String(item['nome'] ?? '') } : null);
  }

  protected criarPosicao(nome: string): void {
    this.processoService.criarCatalogo('posicao-cliente', nome).subscribe((p) => this.posicaoAtual.set(p));
  }

  protected adicionar(): void {
    const nome = this.form.controls.nome.value.trim();
    if (!nome || this.form.controls.documento.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const posicao = this.posicaoAtual();
    const documento = onlyDigits(this.form.controls.documento.value);
    this.linhas.update((atual) => [
      ...atual,
      {
        nome,
        posicaoId: posicao?.id ?? null,
        posicaoNome: posicao?.nome ?? '',
        documento,
        principal: atual.length === 0,
      },
    ]);
    this.limparRascunho();
  }

  protected selecionar(indice: number): void {
    this.selecionado.update((atual) => (atual === indice ? -1 : indice));
  }

  protected remover(): void {
    const indice = this.selecionado();
    if (indice < 0) {
      return;
    }
    this.linhas.update((atual) => {
      const removida = atual[indice];
      const restante = atual.filter((_, i) => i !== indice);
      if (removida?.principal && restante.length > 0) {
        restante[0] = { ...restante[0], principal: true };
      }
      return restante;
    });
    this.selecionado.set(-1);
  }

  /** Marca como principal e move pro topo da lista — mesma regra de `ProcessoClientesComponent.marcarPrincipal`. */
  protected marcarPrincipal(indice: number): void {
    this.linhas.update((atual) => {
      const escolhida = atual[indice];
      const resto = atual.filter((_, i) => i !== indice).map((l) => ({ ...l, principal: false }));
      return [{ ...escolhida, principal: true }, ...resto];
    });
    this.selecionado.set(-1);
  }

  // ===================== API pro pai (`ProcessoDadosGeraisComponent`) =====================

  /** Preenche a lista com uma ficha carregada, resolvendo o nome da posição de cada linha por id. */
  carregar(partes: readonly ParteContrariaApi[]): void {
    this.linhas.set(
      partes.map((p) => ({
        nome: p.nome,
        posicaoId: p.posicao_id,
        posicaoNome: '',
        documento: p.documento ?? '',
        principal: p.principal,
      })),
    );
    this.selecionado.set(-1);
    this.limparRascunho();
    partes.forEach((p, indice) => {
      if (p.posicao_id !== null) {
        this.processoService
          .rotuloPosicaoCliente(p.posicao_id)
          .subscribe((nome) => this.atualizarPosicaoNome(indice, nome));
      }
    });
  }

  /** Zera a lista (novo cadastro). */
  limpar(): void {
    this.linhas.set([]);
    this.selecionado.set(-1);
    this.limparRascunho();
  }

  coletar(): ParteContrariaApi[] {
    return this.linhas().map((l) => ({
      nome: l.nome,
      posicao_id: l.posicaoId,
      documento: l.documento || null,
      principal: l.principal,
    }));
  }

  /** Chamado pelo pai quando "posição do cliente" é renomeada (a partir do dropdown deste componente ou do outro). */
  sincronizarPosicaoRenomeada(id: number, novoNome: string): void {
    this.linhas.update((atual) => atual.map((l) => (l.posicaoId === id ? { ...l, posicaoNome: novoNome } : l)));
    if (this.posicaoAtual()?.id === id) {
      this.posicaoAtual.set({ id, nome: novoNome });
    }
  }

  /** Chamado pelo pai quando "posição do cliente" é excluída. */
  sincronizarPosicaoExcluida(id: number): void {
    this.linhas.update((atual) =>
      atual.map((l) => (l.posicaoId === id ? { ...l, posicaoId: null, posicaoNome: '' } : l)),
    );
    if (this.posicaoAtual()?.id === id) {
      this.posicaoAtual.set(null);
    }
  }

  private atualizarPosicaoNome(indice: number, nome: string): void {
    this.linhas.update((atual) => atual.map((l, i) => (i === indice ? { ...l, posicaoNome: nome } : l)));
  }

  private limparRascunho(): void {
    this.form.reset();
    this.posicaoAtual.set(null);
  }
}
