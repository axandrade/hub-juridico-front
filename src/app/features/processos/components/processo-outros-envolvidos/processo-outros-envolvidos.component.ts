import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';

import { BRAZILIAN_STATES } from '../../../../core/models/pessoa.model';
import { ComboboxComponent } from '../../../../shared/components/combobox/combobox.component';
import { OrgaoJulgadorService } from '../../services/orgao-julgador.service';
import { ParteInteressadaService } from '../../services/parte-interessada.service';
import { PosicaoClienteService } from '../../services/posicao-cliente.service';
import { ResultadoDecisaoService } from '../../services/resultado-decisao.service';
import {
  OutroEnvolvidoAdvogadoApi,
  OutroEnvolvidoMagistradoApi,
  OutroEnvolvidoTestemunhaApi,
  ProcessoApi,
} from '../../services/processo-api.model';
import { ProcessoEditavel } from '../../services/processo-service';

/** O que esta aba entrega pro `save()` do shell (junta no `ProcessoEditavel`). */
export type OutrosEnvolvidosValores = Pick<
  ProcessoEditavel,
  'outrosEnvolvidosAdvogados' | 'outrosEnvolvidosMagistrados' | 'outrosEnvolvidosTestemunhas'
>;

/**
 * Aba "Outros envolvidos" do painel de processo. Três seções, mesmo padrão (mini-form +
 * Adicionar/Remover + listbox), cada uma dona de um array estruturado:
 * <ul>
 *   <li><b>Advogados</b> — advogado / posição (catálogo PosicaoCliente) / OAB / UF.</li>
 *   <li><b>Magistrados</b> — magistrado + data (obrigatórios) / resultado (catálogo ResultadoDecisao)
 *       / órgão (catálogo OrgaoJulgador).</li>
 *   <li><b>Testemunhas</b> — testemunha + parte interessada (catálogo ParteInteressada), os dois
 *       obrigatórios.</li>
 * </ul>
 *
 * <p>O shell (`app-processo-form`) orquestra via `viewChild`: `carregar` / `limpar` / `coletar`,
 * e `(erro)` cai no rodapé — igual `app-processo-dados-gerais`.
 */
@Component({
  selector: 'app-processo-outros-envolvidos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ComboboxComponent],
  templateUrl: './processo-outros-envolvidos.component.html',
  styleUrl: './processo-outros-envolvidos.component.scss',
})
export class ProcessoOutrosEnvolvidosComponent {
  private readonly posicaoService = inject(PosicaoClienteService);
  private readonly resultadoService = inject(ResultadoDecisaoService);
  private readonly orgaoService = inject(OrgaoJulgadorService);
  private readonly parteService = inject(ParteInteressadaService);

  /** Erro numa operação de catálogo (criar/renomear/excluir) — o shell mostra no rodapé. */
  readonly erro = output<string>();

  // ===================== Advogados =====================

  /** Siglas das 27 UFs — lista fixa (sem "+"), igual ao select de UF do cadastro de cliente. */
  protected readonly ufOpcoes = [...BRAZILIAN_STATES];
  protected readonly nomesDePosicao = computed(() =>
    this.posicaoService.posicoes().map((p) => p.nome),
  );

  /** Campos de texto da linha de advogado em edição (posição e UF são `<app-combobox>` → signals). */
  protected readonly advForm: FormGroup<{
    advogado: FormControl<string>;
    oab: FormControl<string>;
  }> = new FormGroup({
    advogado: new FormControl('', { nonNullable: true }),
    oab: new FormControl('', { nonNullable: true }),
  });
  protected readonly posicaoRascunho = signal('');
  protected readonly ufRascunho = signal('');

  protected readonly advogados = signal<OutroEnvolvidoAdvogadoApi[]>([]);
  /** Índice selecionado no listbox de advogados (`-1` = nenhum). */
  protected readonly advSelecionado = signal(-1);

  // ===================== Magistrados =====================

  protected readonly nomesDeResultado = computed(() =>
    this.resultadoService.resultados().map((r) => r.nome),
  );
  protected readonly nomesDeOrgao = computed(() => this.orgaoService.orgaos().map((o) => o.nome));

  /** Campos de texto da linha de magistrado em edição (resultado e órgão são combobox → signals). */
  protected readonly magForm: FormGroup<{
    magistrado: FormControl<string>;
    data: FormControl<string>;
  }> = new FormGroup({
    magistrado: new FormControl('', { nonNullable: true }),
    data: new FormControl('', { nonNullable: true }),
  });
  protected readonly resultadoRascunho = signal('');
  protected readonly orgaoRascunho = signal('');

  protected readonly magistrados = signal<OutroEnvolvidoMagistradoApi[]>([]);
  /** Índice selecionado no listbox de magistrados (`-1` = nenhum). */
  protected readonly magSelecionado = signal(-1);

  // ===================== Testemunhas =====================

  protected readonly nomesDeParte = computed(() => this.parteService.partes().map((p) => p.nome));

  /** Campo de texto da linha de testemunha em edição (parte interessada é combobox → signal). */
  protected readonly testForm: FormGroup<{
    testemunha: FormControl<string>;
  }> = new FormGroup({
    testemunha: new FormControl('', { nonNullable: true }),
  });
  protected readonly parteRascunho = signal('');

  protected readonly testemunhas = signal<OutroEnvolvidoTestemunhaApi[]>([]);
  /** Índice selecionado no listbox de testemunhas (`-1` = nenhum). */
  protected readonly testSelecionado = signal(-1);

  constructor() {
    this.posicaoService.carregar();
    this.resultadoService.carregar();
    this.orgaoService.carregar();
    this.parteService.carregar();
  }

  // ===================== API pro shell =====================

  /** Preenche a aba com uma ficha carregada. */
  carregar(p: ProcessoApi): void {
    this.advogados.set(p.outros_envolvidos_advogados.map((o) => ({ ...o })));
    this.magistrados.set(p.outros_envolvidos_magistrados.map((o) => ({ ...o })));
    this.testemunhas.set(p.outros_envolvidos_testemunhas.map((o) => ({ ...o })));
    this.advSelecionado.set(-1);
    this.magSelecionado.set(-1);
    this.testSelecionado.set(-1);
    this.limparRascunhos();
  }

  /** Zera a aba (novo cadastro). */
  limpar(): void {
    this.advogados.set([]);
    this.magistrados.set([]);
    this.testemunhas.set([]);
    this.advSelecionado.set(-1);
    this.magSelecionado.set(-1);
    this.testSelecionado.set(-1);
    this.limparRascunhos();
  }

  /** Entrega as três listas pro payload de escrita. */
  coletar(): OutrosEnvolvidosValores {
    return {
      outrosEnvolvidosAdvogados: this.advogados(),
      outrosEnvolvidosMagistrados: this.magistrados(),
      outrosEnvolvidosTestemunhas: this.testemunhas(),
    };
  }

  // ===================== lista de advogados =====================

  /** Linha do listbox: "ADVOGADO | POSIÇÃO | OAB | UF" (campo vazio vira "—"). */
  protected rotuloAdvogado(o: OutroEnvolvidoAdvogadoApi): string {
    return [o.advogado, o.posicao, o.oab, o.uf].map((v) => v?.trim() || '—').join(' | ');
  }

  protected adicionarAdvogado(): void {
    const advogado = this.advForm.controls.advogado.value.trim();
    if (!advogado) {
      this.advForm.controls.advogado.markAsTouched();
      return;
    }
    this.advogados.update((atual) => [
      ...atual,
      {
        advogado,
        posicao: this.posicaoRascunho().trim() || null,
        oab: this.advForm.controls.oab.value.trim() || null,
        uf: this.ufRascunho().trim() || null,
      },
    ]);
    this.limparRascunhoAdvogado();
  }

  protected removerAdvogado(): void {
    const i = this.advSelecionado();
    if (i < 0) {
      return;
    }
    this.advogados.update((atual) => atual.filter((_, idx) => idx !== i));
    this.advSelecionado.set(-1);
  }

  protected selecionarAdvogado(indice: number): void {
    this.advSelecionado.update((atual) => (atual === indice ? -1 : indice));
  }

  // ===================== lista de magistrados =====================

  /** Linha do listbox: "MAGISTRADO | RESULTADO | ÓRGÃO | DATA" (campo vazio vira "—"). */
  protected rotuloMagistrado(o: OutroEnvolvidoMagistradoApi): string {
    return [o.magistrado, o.resultado, o.orgao, this.dataBr(o.data)]
      .map((v) => v?.trim() || '—')
      .join(' | ');
  }

  protected adicionarMagistrado(): void {
    const magistrado = this.magForm.controls.magistrado.value.trim();
    const data = this.magForm.controls.data.value.trim();
    if (!magistrado || !data) {
      this.magForm.markAllAsTouched();
      return;
    }
    this.magistrados.update((atual) => [
      ...atual,
      {
        magistrado,
        resultado: this.resultadoRascunho().trim() || null,
        orgao: this.orgaoRascunho().trim() || null,
        data,
      },
    ]);
    this.limparRascunhoMagistrado();
  }

  protected removerMagistrado(): void {
    const i = this.magSelecionado();
    if (i < 0) {
      return;
    }
    this.magistrados.update((atual) => atual.filter((_, idx) => idx !== i));
    this.magSelecionado.set(-1);
  }

  protected selecionarMagistrado(indice: number): void {
    this.magSelecionado.update((atual) => (atual === indice ? -1 : indice));
  }

  // ===================== lista de testemunhas =====================

  /** Linha do listbox: "TESTEMUNHA | PARTE INTERESSADA". */
  protected rotuloTestemunha(o: OutroEnvolvidoTestemunhaApi): string {
    return `${o.testemunha} | ${o.parte_interessada}`;
  }

  protected adicionarTestemunha(): void {
    const testemunha = this.testForm.controls.testemunha.value.trim();
    const parte = this.parteRascunho().trim();
    if (!testemunha || !parte) {
      this.testForm.markAllAsTouched();
      return;
    }
    this.testemunhas.update((atual) => [...atual, { testemunha, parte_interessada: parte }]);
    this.limparRascunhoTestemunha();
  }

  protected removerTestemunha(): void {
    const i = this.testSelecionado();
    if (i < 0) {
      return;
    }
    this.testemunhas.update((atual) => atual.filter((_, idx) => idx !== i));
    this.testSelecionado.set(-1);
  }

  protected selecionarTestemunha(indice: number): void {
    this.testSelecionado.update((atual) => (atual === indice ? -1 : indice));
  }

  // ===================== catálogos (só "adicionar" aqui) =====================

  protected criarPosicao(nome: string): void {
    this.posicaoService.criar(nome).subscribe({
      next: (p) => this.posicaoRascunho.set(p.nome),
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected criarResultado(nome: string): void {
    this.resultadoService.criar(nome).subscribe({
      next: (r) => this.resultadoRascunho.set(r.nome),
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected criarOrgao(nome: string): void {
    this.orgaoService.criar(nome).subscribe({
      next: (o) => this.orgaoRascunho.set(o.nome),
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected criarParte(nome: string): void {
    this.parteService.criar(nome).subscribe({
      next: (p) => this.parteRascunho.set(p.nome),
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  // ===================== helpers =====================

  private limparRascunhos(): void {
    this.limparRascunhoAdvogado();
    this.limparRascunhoMagistrado();
    this.limparRascunhoTestemunha();
  }

  private limparRascunhoAdvogado(): void {
    this.advForm.reset();
    this.posicaoRascunho.set('');
    this.ufRascunho.set('');
  }

  private limparRascunhoMagistrado(): void {
    this.magForm.reset();
    this.resultadoRascunho.set('');
    this.orgaoRascunho.set('');
  }

  private limparRascunhoTestemunha(): void {
    this.testForm.reset();
    this.parteRascunho.set('');
  }

  /** ISO `yyyy-MM-dd` → `dd/MM/yyyy` pra exibição no listbox. */
  private dataBr(iso: string | null): string {
    if (!iso) {
      return '';
    }
    const [ano, mes, dia] = iso.split('-');
    return dia && mes && ano ? `${dia}/${mes}/${ano}` : iso;
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
