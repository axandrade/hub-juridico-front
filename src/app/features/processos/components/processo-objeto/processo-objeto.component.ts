import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Observable, map, switchMap } from 'rxjs';

import { maskMoeda, parseMoeda } from '../../../../core/auth/documentos-br';
import { DomainService, IDomainPage } from '../../../../core/services/domain.service';
import { DomainModelDropdownComponent } from '../../../../shared/components/domain-dropdown/domain-model-dropdown.component';
import { MoedaMaskDirective } from '../../../../shared/directives/moeda-mask.directive';
import { CenarioRiscoApi, ProcessoApi } from '../../services/processo-api.model';
import { ProcessoEditavel } from '../../services/processo-service';

/** Item do catálogo "Objeto" (`id`, `nome`), via `/domain/objeto-processo`. */
interface CatalogoItem {
  id: number;
  nome: string;
}

/** O que a aba "Objeto" entrega pro `save()` do shell (junta no `ProcessoEditavel`). */
export type ObjetoValores = Pick<
  ProcessoEditavel,
  | 'objetoPrincipal'
  | 'objetosSecundarios'
  | 'observacoesObjeto'
  | 'valorPedido'
  | 'valorDeferido'
  | 'cenarioProvavel'
  | 'cenarioPossivel'
  | 'cenarioRemoto'
>;

/**
 * Aba "Objeto" do painel de processo — objeto central + acessórios (catálogo `ObjetoProcesso`),
 * observações do objeto, e os valores da contingência por cenário de risco (provável / possível /
 * remoto) + valor pedido/deferido.
 *
 * <p>O <b>%</b> de cada cenário é read-only: {@code valor ÷ valor pedido × 100}, recalculado ao
 * vivo enquanto se edita, e persistido como snapshot no save.
 *
 * <p>O shell (`app-processo-form`) orquestra via `viewChild`: `carregar` / `limpar` / `coletar`,
 * e `(erro)` cai no rodapé — igual `app-processo-dados-gerais`.
 */
@Component({
  selector: 'app-processo-objeto',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, DomainModelDropdownComponent, MoedaMaskDirective],
  templateUrl: './processo-objeto.component.html',
  styleUrl: './processo-objeto.component.scss',
})
export class ProcessoObjetoComponent {
  private readonly domainService = inject(DomainService);
  private readonly destroyRef = inject(DestroyRef);

  /** Erro numa operação de catálogo (criar/renomear/excluir) — o shell mostra no rodapé. */
  readonly erro = output<string>();

  /** `displayFormatter` do `<app-domain-model-dropdown>` — o catálogo só tem `nome`. */
  protected readonly rotuloCatalogo = (item: Record<string, unknown>): string =>
    String(item['nome'] ?? '');

  protected readonly form = new FormGroup({
    observacoesObjeto: new FormControl('', { nonNullable: true }),
    valorPedido: new FormControl('', { nonNullable: true }),
    valorDeferido: new FormControl('', { nonNullable: true }),
    valorProvavel: new FormControl('', { nonNullable: true }),
    provisionarProvavel: new FormControl(true, { nonNullable: true }),
    valorPossivel: new FormControl('', { nonNullable: true }),
    provisionarPossivel: new FormControl(true, { nonNullable: true }),
    valorRemoto: new FormControl('', { nonNullable: true }),
    provisionarRemoto: new FormControl(true, { nonNullable: true }),
  });

  protected readonly objetoPrincipal = signal('');
  protected readonly objetoSecundarioDraft = signal('');
  protected readonly objetosSecundarios = signal<string[]>([]);
  /** Índice selecionado no listbox de objetos secundários (`-1` = nenhum). */
  protected readonly secSelecionado = signal(-1);

  /** Valores dos campos de moeda como número — base do cálculo dos %. Segue o `valueChanges`. */
  private readonly valores = signal({ pedido: 0, provavel: 0, possivel: 0, remoto: 0 });

  protected readonly pctProvavel = computed(() =>
    this.pct(this.valores().provavel, this.valores().pedido),
  );
  protected readonly pctPossivel = computed(() =>
    this.pct(this.valores().possivel, this.valores().pedido),
  );
  protected readonly pctRemoto = computed(() =>
    this.pct(this.valores().remoto, this.valores().pedido),
  );

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((v) => {
      this.valores.set({
        pedido: parseMoeda(v.valorPedido) ?? 0,
        provavel: parseMoeda(v.valorProvavel) ?? 0,
        possivel: parseMoeda(v.valorPossivel) ?? 0,
        remoto: parseMoeda(v.valorRemoto) ?? 0,
      });
    });
  }

  // ===================== API pro shell =====================

  carregar(p: ProcessoApi): void {
    this.form.reset({
      observacoesObjeto: p.observacoes_objeto ?? '',
      valorPedido: maskMoeda(p.valor_pedido),
      valorDeferido: maskMoeda(p.valor_deferido),
      valorProvavel: maskMoeda(p.cenario_provavel.valor),
      provisionarProvavel: p.cenario_provavel.provisionar,
      valorPossivel: maskMoeda(p.cenario_possivel.valor),
      provisionarPossivel: p.cenario_possivel.provisionar,
      valorRemoto: maskMoeda(p.cenario_remoto.valor),
      provisionarRemoto: p.cenario_remoto.provisionar,
    });
    this.objetoPrincipal.set(p.objeto_principal ?? '');
    this.objetosSecundarios.set([...p.objetos_secundarios]);
    this.objetoSecundarioDraft.set('');
    this.secSelecionado.set(-1);
  }

  limpar(): void {
    this.form.reset({
      observacoesObjeto: '',
      valorPedido: '',
      valorDeferido: '',
      valorProvavel: '',
      provisionarProvavel: true,
      valorPossivel: '',
      provisionarPossivel: true,
      valorRemoto: '',
      provisionarRemoto: true,
    });
    this.objetoPrincipal.set('');
    this.objetosSecundarios.set([]);
    this.objetoSecundarioDraft.set('');
    this.secSelecionado.set(-1);
  }

  coletar(): ObjetoValores {
    const raw = this.form.getRawValue();
    return {
      objetoPrincipal: this.objetoPrincipal(),
      objetosSecundarios: this.objetosSecundarios(),
      observacoesObjeto: raw.observacoesObjeto,
      valorPedido: parseMoeda(raw.valorPedido),
      valorDeferido: parseMoeda(raw.valorDeferido),
      cenarioProvavel: this.cenario(raw.valorProvavel, this.pctProvavel(), raw.provisionarProvavel),
      cenarioPossivel: this.cenario(raw.valorPossivel, this.pctPossivel(), raw.provisionarPossivel),
      cenarioRemoto: this.cenario(raw.valorRemoto, this.pctRemoto(), raw.provisionarRemoto),
    };
  }

  // ===================== objetos secundários =====================

  protected adicionarSecundario(): void {
    const v = this.objetoSecundarioDraft().trim();
    if (!v || this.objetosSecundarios().includes(v)) {
      return;
    }
    this.objetosSecundarios.update((l) => [...l, v]);
    this.objetoSecundarioDraft.set('');
  }

  protected removerSecundario(): void {
    const i = this.secSelecionado();
    if (i < 0) {
      return;
    }
    this.objetosSecundarios.update((l) => l.filter((_, idx) => idx !== i));
    this.secSelecionado.set(-1);
  }

  protected selecionarSecundario(indice: number): void {
    this.secSelecionado.update((atual) => (atual === indice ? -1 : indice));
  }

  // ===================== % =====================

  /** `27.78` → `"27,78"`; `null` → `""`. */
  protected pctTexto(v: number | null): string {
    return v === null ? '' : v.toFixed(2).replace('.', ',');
  }

  // ===================== catálogo "Objeto" — CRUD via `/domain/objeto-processo` =====================

  protected criarObjeto(nome: string, alvo: 'principal' | 'secundario'): void {
    this.domainService
      .post<{ nome: string }>({ entityName: 'objeto-processo', body: { nome } })
      .pipe(
        switchMap((criado) =>
          this.domainService.get<CatalogoItem>({ entityName: 'objeto-processo', entityId: criado.id, fields: 'id,nome' }),
        ),
      )
      .subscribe({
        next: (o) =>
          alvo === 'principal'
            ? this.objetoPrincipal.set(o.nome)
            : this.objetoSecundarioDraft.set(o.nome),
        error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
      });
  }

  protected renomearObjeto({ de, para }: { de: string; para: string }): void {
    this.buscarIdPorNome(de).subscribe({
      next: (id) => {
        if (id === null) {
          return;
        }
        this.domainService.patch({ entityName: 'objeto-processo', entityId: id, body: { nome: para } }).subscribe({
          next: () => {
            if (this.objetoPrincipal() === de) {
              this.objetoPrincipal.set(para);
            }
            this.objetosSecundarios.update((l) => l.map((x) => (x === de ? para : x)));
          },
          error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
        });
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected excluirObjeto(nome: string): void {
    this.buscarIdPorNome(nome).subscribe({
      next: (id) => {
        if (id === null) {
          return;
        }
        this.domainService.delete({ entityName: 'objeto-processo', entityId: id }).subscribe({
          next: () => {
            if (this.objetoPrincipal() === nome) {
              this.objetoPrincipal.set('');
            }
          },
          error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
        });
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  /**
   * Resolve o id do catálogo a partir do nome exato — `renomear`/`excluir` só recebem o nome (o
   * dropdown trabalha em modo texto-livre aqui, `valueField` não é `id`; ao contrário de
   * Magistrado/Perito nesta app, não há FK persistida no processo pra já ter o id à mão).
   */
  private buscarIdPorNome(nome: string): Observable<number | null> {
    const nomeLimpo = nome.trim().replace(/'/g, '');
    return this.domainService
      .get<IDomainPage<CatalogoItem>>({ entityName: 'objeto-processo', filter: `nome eq '${nomeLimpo}'`, size: 1 })
      .pipe(map((pagina) => pagina.content[0]?.id ?? null));
  }

  // ===================== helpers =====================

  private cenario(valorMasc: string, pct: number | null, provisionar: boolean): CenarioRiscoApi {
    return { valor: parseMoeda(valorMasc), percentual: pct, provisionar };
  }

  /** % = valor ÷ valor pedido × 100, 2 casas. `null` se faltar a base ou o valor do cenário. */
  private pct(valor: number, pedido: number): number | null {
    if (!pedido || !valor) {
      return null;
    }
    return Math.round((valor / pedido) * 10000) / 100;
  }

  private mensagemErroHttp(err: unknown): string {
    const e = err as {
      error?: { detail?: string; title?: string; message?: string };
      message?: string;
      status?: number;
    };
    if (e?.status === 0) {
      return 'Sem conexão com o servidor.';
    }
    return (
      e?.error?.detail ||
      e?.error?.title ||
      e?.error?.message ||
      e?.message ||
      'Erro ao comunicar com o servidor.'
    );
  }
}
