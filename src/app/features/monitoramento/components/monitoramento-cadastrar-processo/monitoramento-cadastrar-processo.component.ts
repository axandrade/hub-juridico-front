import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';

import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { DomainModelDropdownComponent } from '../../../../shared/components/domain-dropdown/domain-model-dropdown.component';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { ToastService } from '../../../../shared/services/toast.service';
import { MonitoramentoProcessoRow, MonitoramentoService } from '../../services/monitoramento.service';

interface PessoaEscolhida {
  id: number;
  nome: string;
}

/**
 * "Cadastrar no sistema": cria em `/domain/processo` o processo de um número monitorado, com o que o
 * monitoramento já sabe — judicial, número, ação, status, observação e o contrário como parte
 * contrária principal. O cliente do monitoramento é texto livre e o do processo é uma Pessoa do
 * cadastro, então aqui o usuário escolhe a Pessoa correspondente (opcional — dá pra completar
 * depois na tela de Processos). O vínculo volta sozinho na listagem: a view cruza pelo número.
 */
@Component({
  selector: 'app-monitoramento-cadastrar-processo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModalComponent, ButtonComponent, DomainModelDropdownComponent],
  templateUrl: './monitoramento-cadastrar-processo.component.html',
  styleUrl: '../monitoramento-processo-form/monitoramento-processo-form.component.scss',
})
export class MonitoramentoCadastrarProcessoComponent {
  private readonly service = inject(MonitoramentoService);
  private readonly toast = inject(ToastService);

  readonly processo = input.required<MonitoramentoProcessoRow>();

  readonly cadastrado = output<void>();
  readonly fechar = output<void>();

  protected readonly pessoa = signal<PessoaEscolhida | null>(null);
  protected readonly levarObservacao = signal(true);
  protected readonly salvando = signal(false);

  protected readonly rotuloPessoa = (item: Record<string, unknown>): string =>
    String(item['nome'] ?? item['razaoSocial'] ?? item['nomeFantasia'] ?? '(sem nome)');

  protected onPessoa(item: Record<string, unknown> | null): void {
    this.pessoa.set(item ? { id: Number(item['id']), nome: this.rotuloPessoa(item) } : null);
  }

  protected cadastrar(): void {
    if (this.salvando()) {
      return;
    }
    this.salvando.set(true);
    const p = this.processo();
    const pessoa = this.pessoa();
    this.service
      .cadastrarNoSistema({
        tipo: 'JUDICIAL',
        numero_cnj: p.numeroCnj,
        acao_id: p.acaoId,
        status_id: p.statusId,
        observacoes_gerais: this.levarObservacao() ? p.observacao : null,
        clientes: pessoa ? [{ pessoa_id: pessoa.id, posicao_id: null, principal: true }] : [],
        partes_contrarias: p.contrario ? [{ nome: p.contrario, posicao_id: null, documento: null, principal: true }] : [],
      })
      .subscribe({
        next: (pasta) => {
          this.salvando.set(false);
          this.toast.sucesso(`${p.numeroCnj} cadastrado no sistema${pasta ? ` como ${pasta}` : ''}.`);
          this.cadastrado.emit();
          this.fechar.emit();
        },
        error: () => {
          this.salvando.set(false);
          this.toast.erro('Não foi possível cadastrar o processo no sistema.');
        },
      });
  }
}
