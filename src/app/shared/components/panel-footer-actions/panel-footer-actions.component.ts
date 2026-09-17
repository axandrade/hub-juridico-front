import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { ButtonComponent } from '../button/button.component';

/**
 * Rodapé padrão dos painéis de cadastro (Advogado, Cliente, Processo — mesmo grupo de botões
 * repetido nos três): "Limpar painel" / "Inativar" ou "Reativar" (só quando o registro já existe)
 * / "Confirmar" (durante a confirmação de inativação) / "Salvar". Inspirado no
 * `UcModalFooterButtonsComponent` do cev-front, mas enxuto pro nosso `app-button` — a versão deles
 * espelha ~40 propriedades do `p-button` do PrimeNG (que não usamos aqui), então só expomos o que
 * os consumidores de fato variam: estado (persistido/inativo/confirmando/salvando) e os 4 eventos.
 *
 * Sempre dispara `(salvar)` no clique — nenhum consumidor precisa de `<form (submit)>`/
 * `type="submit"` mais (os três antes divergiam nisso: Advogado/Cliente confiavam no submit
 * nativo do form, Processo já usava clique direto; unificado no clique direto, mais simples e sem
 * risco de disparo duplo). Efeito colateral pequeno e deliberado: Enter num campo de texto não
 * envia mais o form em Advogado/Cliente (Processo já não tinha esse comportamento).
 */
@Component({
  selector: 'app-panel-footer-actions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent],
  styleUrl: './panel-footer-actions.component.scss',
  template: `
    <app-button
      variant="tertiary"
      size="sm"
      icon="fa-solid fa-eraser"
      label="Limpar painel"
      (clicked)="limpar.emit()"
    />
    @if (persistido()) {
      <app-button
        variant="secondary"
        size="sm"
        [icon]="inativo() ? 'fa-solid fa-rotate-left' : 'fa-solid fa-ban'"
        [label]="inativo() ? 'Reativar' : 'Inativar'"
        (clicked)="alterarStatus.emit()"
      />
    }
    @if (confirmandoInativacao()) {
      <app-button
        variant="secondary"
        size="sm"
        icon="fa-solid fa-check"
        label="Confirmar"
        (clicked)="confirmarInativacao.emit()"
      />
    }
    <app-button
      variant="primary"
      size="sm"
      icon="fa-solid fa-floppy-disk"
      [label]="salvando() ? 'Salvando...' : 'Salvar'"
      [disabled]="salvando()"
      (clicked)="salvar.emit()"
    />
  `,
})
export class PanelFooterActionsComponent {
  /** `true` = registro já existe (mostra Inativar/Reativar); `false` = cadastro novo. */
  readonly persistido = input<boolean>(false);
  /** `true` = está inativo (botão vira "Reativar"); `false` = ativo (botão "Inativar"). */
  readonly inativo = input<boolean>(false);
  readonly confirmandoInativacao = input<boolean>(false);
  readonly salvando = input<boolean>(false);

  readonly limpar = output<void>();
  /** Clique em "Inativar"/"Reativar" — quem decide se precisa de confirmação é o consumidor. */
  readonly alterarStatus = output<void>();
  readonly confirmarInativacao = output<void>();
  readonly salvar = output<void>();
}
