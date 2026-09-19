import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';

import { DomainModelDropdownComponent } from '../../../../shared/components/domain-dropdown/domain-model-dropdown.component';
import { PastaClienteService } from '../../../clients/services/pasta-cliente.service';
import { ClienteProcessoApi } from '../../services/processo-api.model';
import { ProcessoService } from '../../services/processo-service';

/** Item de um catálogo simples (`id`, `nome`) — `posicao-cliente`, via `/domain`. */
interface CatalogoItem {
  id: number;
  nome: string;
}

/** Uma linha da lista, já com os nomes resolvidos pra exibição. */
interface ClienteProcessoLinha {
  pessoaId: number;
  pessoaNome: string;
  posicaoId: number | null;
  posicaoNome: string;
  principal: boolean;
}

/**
 * Lista de clientes do processo, dentro da aba "Dados gerais" (`app-processo-dados-gerais`).
 * Mesmo padrão de mini-form + Adicionar/Remover + listbox de seleção de
 * `ProcessoOutrosEnvolvidosComponent` (ex.: Magistrados) — clica na linha pra selecionar, "Remover"
 * (ao lado do botão de confirmar) tira a selecionada. A estrela de "principal" é uma ação à parte,
 * sempre visível por linha, reaproveitando a interação de `ClientEmailListComponent.makePrimary`
 * (marca e move pro topo; zera os outros; o primeiro adicionado já nasce principal; remover o
 * principal promove o novo primeiro item).
 *
 * Selecionar uma linha também vira modo de edição dela (`modoEdicao`): o mini-form pré-preenche
 * cliente/posição com os dados daquela linha e o botão único (`confirmar()`) passa de "Adicionar"
 * pra "Salvar" — sem nenhum controle novo na tela, só reaproveita o clique que já existia pra
 * "Remover". Clicar na mesma linha de novo (desmarca) ou trocar de linha limpa/repõe o rascunho.
 *
 * A posição de cada cliente é o catálogo `posicao_cliente` (mesmo catálogo do campo "Posição da
 * parte contrária", que fica no pai). Editar/excluir um item desse catálogo só é oferecido ali —
 * aqui o dropdown só permite "Adicionar" — e o pai propaga pra cá via `sincronizarPosicaoRenomeada`/
 * `sincronizarPosicaoExcluida` (ver `ProcessoDadosGeraisComponent.posicoesEmUso`).
 *
 * Mesma pessoa não pode entrar duas vezes na lista — `adicionar()`/`salvarEdicao()` rejeitam com
 * `erro` (o pai repassa pro rodapé do shell, mesmo canal dos erros de catálogo); editando, a
 * checagem ignora a própria linha selecionada.
 *
 * Botão de pasta por linha (`abrirPasta`) — mesma ideia do botão de pasta de Magistrados em
 * "Outros envolvidos", mas sem dialog próprio: reaproveita o `PastaClienteService`/
 * `app-pasta-cliente-dialog` global (o mesmo do botão "Abrir pasta do cliente" no header).
 */
@Component({
  selector: 'app-processo-clientes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DomainModelDropdownComponent],
  templateUrl: './processo-clientes.component.html',
  styleUrl: './processo-clientes.component.scss',
})
export class ProcessoClientesComponent {
  private readonly processoService = inject(ProcessoService);
  private readonly pastaCliente = inject(PastaClienteService);

  /** Erro de validação (ex.: cliente duplicado) — o pai repassa pro rodapé do shell. */
  readonly erro = output<string>();

  protected readonly rotuloPessoaFormatter = (item: Record<string, unknown>): string =>
    String(item['nome'] ?? item['razaoSocial'] ?? item['nomeFantasia'] ?? '(sem nome)');
  protected readonly rotuloCatalogo = (item: Record<string, unknown>): string => String(item['nome'] ?? '');

  protected readonly linhas = signal<ClienteProcessoLinha[]>([]);
  /** Índice selecionado na lista (`-1` = nenhum) — igual ao listbox de Magistrados em "Outros envolvidos". */
  protected readonly selecionado = signal(-1);
  /**
   * Com uma linha selecionada, o mini-formulário vira edição dela (cliente/posição pré-
   * preenchidos, "Adicionar" vira "Salvar") em vez de cadastro novo — mesmo clique que já
   * seleciona pra "Remover", sem nenhum controle novo na tela.
   */
  protected readonly modoEdicao = computed(() => this.selecionado() >= 0);

  protected readonly clienteAtual = signal<CatalogoItem | null>(null);
  protected readonly clienteValor = computed(() => {
    const c = this.clienteAtual();
    return c ? String(c.id) : '';
  });

  protected readonly posicaoAtual = signal<CatalogoItem | null>(null);
  protected readonly posicaoValor = computed(() => {
    const p = this.posicaoAtual();
    return p ? String(p.id) : '';
  });

  protected onClienteSelected(item: Record<string, unknown> | null): void {
    this.clienteAtual.set(item ? { id: Number(item['id']), nome: this.rotuloPessoaFormatter(item) } : null);
  }

  protected onPosicaoSelected(item: Record<string, unknown> | null): void {
    this.posicaoAtual.set(item ? { id: Number(item['id']), nome: String(item['nome'] ?? '') } : null);
  }

  protected criarPosicao(nome: string): void {
    this.processoService.criarCatalogo('posicao-cliente', nome).subscribe((p) => this.posicaoAtual.set(p));
  }

  /** Botão único do mini-formulário: sem seleção, adiciona; com uma linha selecionada, salva a edição dela. */
  protected confirmar(): void {
    if (this.modoEdicao()) {
      this.salvarEdicao();
    } else {
      this.adicionar();
    }
  }

  private adicionar(): void {
    const cliente = this.clienteAtual();
    if (!cliente) {
      return;
    }
    if (this.linhas().some((l) => l.pessoaId === cliente.id)) {
      this.erro.emit(`${cliente.nome} já está na lista.`);
      return;
    }
    const posicao = this.posicaoAtual();
    this.linhas.update((atual) => [
      ...atual,
      {
        pessoaId: cliente.id,
        pessoaNome: cliente.nome,
        posicaoId: posicao?.id ?? null,
        posicaoNome: posicao?.nome ?? '',
        principal: atual.length === 0,
      },
    ]);
    this.limparRascunho();
  }

  /** Atualiza cliente/posição da linha selecionada no lugar — não mexe em `principal` nem na ordem. */
  private salvarEdicao(): void {
    const indice = this.selecionado();
    const cliente = this.clienteAtual();
    if (indice < 0 || !cliente) {
      return;
    }
    if (this.linhas().some((l, i) => i !== indice && l.pessoaId === cliente.id)) {
      this.erro.emit(`${cliente.nome} já está na lista.`);
      return;
    }
    const posicao = this.posicaoAtual();
    this.linhas.update((atual) =>
      atual.map((l, i) =>
        i === indice
          ? {
              ...l,
              pessoaId: cliente.id,
              pessoaNome: cliente.nome,
              posicaoId: posicao?.id ?? null,
              posicaoNome: posicao?.nome ?? '',
            }
          : l,
      ),
    );
    this.selecionado.set(-1);
    this.limparRascunho();
  }

  /** Selecionar preenche o mini-formulário com a linha (vira edição); clicar de novo desmarca e limpa. */
  protected selecionar(indice: number): void {
    this.selecionado.update((atual) => (atual === indice ? -1 : indice));
    const novoIndice = this.selecionado();
    if (novoIndice < 0) {
      this.limparRascunho();
      return;
    }
    const linha = this.linhas()[novoIndice];
    this.clienteAtual.set({ id: linha.pessoaId, nome: linha.pessoaNome });
    this.posicaoAtual.set(linha.posicaoId !== null ? { id: linha.posicaoId, nome: linha.posicaoNome } : null);
  }

  /** Abre o diálogo de arquivos daquele cliente (botão na própria linha, não depende de seleção). */
  protected abrirPasta(linha: ClienteProcessoLinha): void {
    this.pastaCliente.definirCliente({ id: linha.pessoaId, nome: linha.pessoaNome });
    this.pastaCliente.abrir();
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
    this.limparRascunho();
  }

  /** Marca como principal e move pro topo da lista — mesma regra de `ClientEmailListComponent.makePrimary`. */
  protected marcarPrincipal(indice: number): void {
    this.linhas.update((atual) => {
      const escolhida = atual[indice];
      const resto = atual.filter((_, i) => i !== indice).map((l) => ({ ...l, principal: false }));
      return [{ ...escolhida, principal: true }, ...resto];
    });
    // A reordenação invalida o índice selecionado — evita apagar a linha errada (ou editar por engano).
    this.selecionado.set(-1);
    this.limparRascunho();
  }

  // ===================== API pro pai (`ProcessoDadosGeraisComponent`) =====================

  /** Preenche a lista com uma ficha carregada, resolvendo o nome de cada pessoa/posição por id. */
  carregar(clientes: readonly ClienteProcessoApi[]): void {
    this.linhas.set(
      clientes.map((c) => ({
        pessoaId: c.pessoa_id,
        pessoaNome: '',
        posicaoId: c.posicao_id,
        posicaoNome: '',
        principal: c.principal,
      })),
    );
    this.selecionado.set(-1);
    this.limparRascunho();
    clientes.forEach((c, indice) => {
      this.processoService.rotuloPessoa(c.pessoa_id).subscribe((nome) => this.atualizarNome(indice, 'pessoaNome', nome));
      if (c.posicao_id !== null) {
        this.processoService
          .rotuloPosicaoCliente(c.posicao_id)
          .subscribe((nome) => this.atualizarNome(indice, 'posicaoNome', nome));
      }
    });
  }

  /** Zera a lista (novo cadastro). */
  limpar(): void {
    this.linhas.set([]);
    this.selecionado.set(-1);
    this.limparRascunho();
  }

  coletar(): ClienteProcessoApi[] {
    return this.linhas().map((l) => ({ pessoa_id: l.pessoaId, posicao_id: l.posicaoId, principal: l.principal }));
  }

  /** Chamado pelo pai quando "posição do cliente" é renomeada por outro campo da mesma aba. */
  sincronizarPosicaoRenomeada(id: number, novoNome: string): void {
    this.linhas.update((atual) => atual.map((l) => (l.posicaoId === id ? { ...l, posicaoNome: novoNome } : l)));
    if (this.posicaoAtual()?.id === id) {
      this.posicaoAtual.set({ id, nome: novoNome });
    }
  }

  /** Chamado pelo pai quando "posição do cliente" é excluída por outro campo da mesma aba. */
  sincronizarPosicaoExcluida(id: number): void {
    this.linhas.update((atual) =>
      atual.map((l) => (l.posicaoId === id ? { ...l, posicaoId: null, posicaoNome: '' } : l)),
    );
    if (this.posicaoAtual()?.id === id) {
      this.posicaoAtual.set(null);
    }
  }

  private atualizarNome(indice: number, campo: 'pessoaNome' | 'posicaoNome', nome: string): void {
    this.linhas.update((atual) => atual.map((l, i) => (i === indice ? { ...l, [campo]: nome } : l)));
  }

  private limparRascunho(): void {
    this.clienteAtual.set(null);
    this.posicaoAtual.set(null);
  }
}
