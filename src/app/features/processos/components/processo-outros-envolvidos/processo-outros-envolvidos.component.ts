import { ChangeDetectionStrategy, Component } from '@angular/core';

import { ProcessoApi } from '../../services/processo-api.model';

/**
 * Aba "Outros envolvidos" do painel de processo. Ainda **sem campos** — entram numa próxima
 * etapa. Já existe como componente pra fixar a fronteira: quando ganhar campos, eles moram aqui
 * (FormGroup próprio / signals), o shell (`app-processo-form`) chama `carregar` / `limpar` via
 * `viewChild` — igual `app-processo-dados-gerais` — e passa a juntar o `coletar()` no payload.
 */
@Component({
  selector: 'app-processo-outros-envolvidos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './processo-outros-envolvidos.component.html',
  styleUrl: './processo-outros-envolvidos.component.scss',
})
export class ProcessoOutrosEnvolvidosComponent {
  /** Preenche a aba com uma ficha carregada. No-op enquanto não há campos. */
  carregar(_p: ProcessoApi): void {
    // sem campos ainda
  }

  /** Zera a aba (novo cadastro). No-op enquanto não há campos. */
  limpar(): void {
    // sem campos ainda
  }
}
