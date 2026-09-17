import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { switchMap } from 'rxjs';

import { cpfValidator, maskCpf, onlyDigits } from '../../../../core/auth/documentos-br';
import { BRAZILIAN_STATES } from '../../../../core/models/pessoa.model';
import { DomainService } from '../../../../core/services/domain.service';
import { ComboboxComponent } from '../../../../shared/components/combobox/combobox.component';
import { DomainModelDropdownComponent } from '../../../../shared/components/domain-dropdown/domain-model-dropdown.component';
import { ModalComponent } from '../../../../shared/components/modal/modal.component';
import { CpfMaskDirective } from '../../../../shared/directives/cpf-mask.directive';
import { OrgaoJulgadorService } from '../../services/orgao-julgador.service';
import { PastaMagistradoService } from '../../services/pasta-magistrado.service';
import { PastaPeritoService } from '../../services/pasta-perito.service';
import { TribunalService } from '../../services/tribunal.service';
import {
  OutroEnvolvidoAdvogadoApi,
  OutroEnvolvidoAssistenteTecnicoApi,
  OutroEnvolvidoMagistradoApi,
  OutroEnvolvidoPeritoApi,
  OutroEnvolvidoTestemunhaApi,
  ProcessoApi,
} from '../../services/processo-api.model';
import { ProcessoEditavel, ProcessoService } from '../../services/processo-service';

/** Item de um catálogo simples (`id`, `nome`) — Magistrado/ResultadoDecisao/ParteInteressada, via `/domain`. */
interface CatalogoItem {
  id: number;
  nome: string;
}

/** Item do catálogo Perito — igual a `CatalogoItem`, com `cpf` opcional a mais. */
interface PeritoItem extends CatalogoItem {
  cpf: string | null;
}

/** O que esta aba entrega pro `save()` do shell (junta no `ProcessoEditavel`). */
export type OutrosEnvolvidosValores = Pick<
  ProcessoEditavel,
  | 'outrosEnvolvidosAdvogados'
  | 'outrosEnvolvidosMagistrados'
  | 'outrosEnvolvidosTestemunhas'
  | 'outrosEnvolvidosPeritos'
  | 'outrosEnvolvidosAssistentesTecnicos'
>;

/**
 * Aba "Outros envolvidos" do painel de processo. Cinco seções, mesmo padrão (mini-form +
 * Adicionar/Remover + listbox), cada uma dona de um array estruturado:
 * <ul>
 *   <li><b>Advogados</b> — advogado / posição (catálogo PosicaoCliente) / OAB / UF.</li>
 *   <li><b>Magistrados</b> — magistrado + data (obrigatórios) / resultado (catálogo ResultadoDecisao)
 *       / órgão (catálogo OrgaoJulgador).</li>
 *   <li><b>Testemunhas</b> — testemunha + parte interessada (catálogo ParteInteressada), os dois
 *       obrigatórios.</li>
 *   <li><b>Perito Judicial</b> — perito (catálogo Perito, com nome + CPF opcional; "+" abre um
 *       mini-formulário em vez de criar direto, já que tem 2 campos) / resultado (catálogo
 *       ResultadoDecisao, mesmo catálogo de Magistrados).</li>
 *   <li><b>Assistente Técnico</b> — assistente técnico + parte interessada (catálogo
 *       ParteInteressada, mesmo de Testemunhas), os dois obrigatórios / CPF (opcional).</li>
 * </ul>
 *
 * <p>O shell (`app-processo-form`) orquestra via `viewChild`: `carregar` / `limpar` / `coletar`,
 * e `(erro)` cai no rodapé — igual `app-processo-dados-gerais`.
 */
@Component({
  selector: 'app-processo-outros-envolvidos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ComboboxComponent, DomainModelDropdownComponent, CpfMaskDirective, ModalComponent],
  templateUrl: './processo-outros-envolvidos.component.html',
  styleUrl: './processo-outros-envolvidos.component.scss',
})
export class ProcessoOutrosEnvolvidosComponent {
  private readonly domainService = inject(DomainService);
  private readonly processoService = inject(ProcessoService);
  private readonly orgaoService = inject(OrgaoJulgadorService);
  private readonly tribunalService = inject(TribunalService);
  private readonly pastaMagistradoService = inject(PastaMagistradoService);
  private readonly pastaPeritoService = inject(PastaPeritoService);

  /** Erro numa operação de catálogo (criar/renomear/excluir) — o shell mostra no rodapé. */
  readonly erro = output<string>();

  // ===================== Advogados =====================

  /** Siglas das 27 UFs — lista fixa (sem "+"), igual ao select de UF do cadastro de cliente. */
  protected readonly ufOpcoes = [...BRAZILIAN_STATES];
  /**
   * `displayFormatter` compartilhado por todos os `<app-domain-model-dropdown>` desta aba — todos
   * os catálogos aqui só têm `nome` (Perito tem `cpf` a mais, mas não entra no rótulo).
   */
  protected readonly rotuloCatalogo = (item: Record<string, unknown>): string =>
    String(item['nome'] ?? '');

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

  /** Campo de texto da linha de magistrado em edição (magistrado/resultado/tribunal/órgão são combobox → signals). */
  protected readonly magForm: FormGroup<{
    data: FormControl<string>;
  }> = new FormGroup({
    data: new FormControl('', { nonNullable: true }),
  });
  /**
   * Magistrado selecionado no `<app-domain-model-dropdown>` — ao contrário dos demais catálogos
   * desta aba (texto solto, sem vínculo), `magistrado_id` é chave estrangeira real (ver
   * `coletar()`), então o dropdown trabalha por id (`valueField` padrão) e guarda o item cru
   * inteiro (via `itemSelected`), não só o nome.
   */
  protected readonly magistradoAtual = signal<CatalogoItem | null>(null);
  protected readonly magistradoValor = computed(() => {
    const m = this.magistradoAtual();
    return m ? String(m.id) : '';
  });
  protected readonly resultadoRascunho = signal('');

  // --- cascata Tribunal → Órgão do magistrado em edição (mesmo padrão de "Órgão processante") ---
  protected readonly nomesDeTribunal = computed(() =>
    this.tribunalService.tribunais().map((t) => t.nome),
  );
  protected readonly tribunalRascunhoMag = signal('');
  protected readonly orgaoRascunhoMag = signal('');
  /** Só os órgãos do tribunal escolhido no rascunho — vazio até escolher um tribunal. */
  protected readonly orgaosDoTribunalRascunhoMag = computed(() => {
    const tribunal = this.tribunalService.tribunais().find((t) => t.nome === this.tribunalRascunhoMag());
    if (!tribunal) {
      return [];
    }
    const prefixo = `${tribunal.nome} - `;
    return this.orgaoService
      .orgaos()
      .filter((o) => o.tribunal_id === tribunal.id)
      .map((o) => ({ id: o.id, descricao: o.nome.startsWith(prefixo) ? o.nome.slice(prefixo.length) : o.nome }));
  });
  protected readonly nomesDeOrgaoDoTribunalMag = computed(() =>
    this.orgaosDoTribunalRascunhoMag().map((o) => o.descricao),
  );

  protected readonly magistrados = signal<OutroEnvolvidoMagistradoApi[]>([]);
  /** Índice selecionado no listbox de magistrados (`-1` = nenhum). */
  protected readonly magSelecionado = signal(-1);

  // ===================== Testemunhas =====================

  /** Campos de texto da linha de testemunha em edição (parte interessada é combobox → signal). */
  protected readonly testForm: FormGroup<{
    testemunha: FormControl<string>;
    cpf: FormControl<string>;
  }> = new FormGroup({
    testemunha: new FormControl('', { nonNullable: true }),
    cpf: new FormControl('', { nonNullable: true, validators: [cpfValidator] }),
  });
  protected readonly parteRascunho = signal('');

  protected readonly testemunhas = signal<OutroEnvolvidoTestemunhaApi[]>([]);
  /** Índice selecionado no listbox de testemunhas (`-1` = nenhum). */
  protected readonly testSelecionado = signal(-1);

  // ===================== Perito Judicial =====================

  /** Perito selecionado no dropdown — `perito_id` também é FK real, mesmo motivo de `magistradoAtual`. */
  protected readonly peritoAtual = signal<PeritoItem | null>(null);
  protected readonly peritoValor = computed(() => {
    const p = this.peritoAtual();
    return p ? String(p.id) : '';
  });
  protected readonly resultadoRascunhoPerito = signal('');

  protected readonly peritos = signal<OutroEnvolvidoPeritoApi[]>([]);
  /** Índice selecionado no listbox de peritos (`-1` = nenhum). */
  protected readonly peritoSelecionado = signal(-1);

  /**
   * Cadastro de um perito novo no catálogo — o "+" do combobox só pede um texto (nome), mas o
   * catálogo de perito tem nome E cpf, então abre este mini-formulário em vez de criar direto.
   */
  protected readonly novoPeritoAberto = signal(false);
  protected readonly novoPeritoForm: FormGroup<{
    nome: FormControl<string>;
    cpf: FormControl<string>;
  }> = new FormGroup({
    nome: new FormControl('', { nonNullable: true }),
    cpf: new FormControl('', { nonNullable: true, validators: [cpfValidator] }),
  });

  // ===================== Assistente Técnico =====================

  /** Campos de texto da linha de assistente técnico em edição (parte interessada é combobox → signal). */
  protected readonly assistTecForm: FormGroup<{
    assistenteTecnico: FormControl<string>;
    cpf: FormControl<string>;
  }> = new FormGroup({
    assistenteTecnico: new FormControl('', { nonNullable: true }),
    cpf: new FormControl('', { nonNullable: true, validators: [cpfValidator] }),
  });
  protected readonly parteRascunhoAssistTec = signal('');

  protected readonly assistentesTecnicos = signal<OutroEnvolvidoAssistenteTecnicoApi[]>([]);
  /** Índice selecionado no listbox de assistentes técnicos (`-1` = nenhum). */
  protected readonly assistTecSelecionado = signal(-1);

  // ===================== Visibilidade das seções =====================
  // Preferência do usuário, não dado do processo — cada seção começa fechada e só abre/fecha no
  // clique do próprio usuário; `carregar`/`limpar` não mexem aqui, então persiste entre saves e
  // ao trocar de processo (mesmo padrão dos históricos de observações/tribunais).
  protected readonly mostrarAdvogados = signal(false);
  protected readonly mostrarMagistrados = signal(false);
  protected readonly mostrarTestemunhas = signal(false);
  protected readonly mostrarPeritos = signal(false);
  protected readonly mostrarAssistentesTecnicos = signal(false);

  protected toggleAdvogados(): void {
    this.mostrarAdvogados.update((v) => !v);
  }

  protected toggleMagistrados(): void {
    this.mostrarMagistrados.update((v) => !v);
  }

  protected toggleTestemunhas(): void {
    this.mostrarTestemunhas.update((v) => !v);
  }

  protected togglePeritos(): void {
    this.mostrarPeritos.update((v) => !v);
  }

  protected toggleAssistentesTecnicos(): void {
    this.mostrarAssistentesTecnicos.update((v) => !v);
  }

  constructor() {
    this.orgaoService.carregar();
    this.tribunalService.carregar();
  }

  // ===================== API pro shell =====================

  /** Preenche a aba com uma ficha carregada. */
  carregar(p: ProcessoApi): void {
    this.advogados.set(p.outros_envolvidos_advogados.map((o) => ({ ...o })));
    this.magistrados.set(p.outros_envolvidos_magistrados.map((o) => ({ ...o })));
    this.testemunhas.set(p.outros_envolvidos_testemunhas.map((o) => ({ ...o })));
    this.peritos.set(p.outros_envolvidos_peritos.map((o) => ({ ...o })));
    this.assistentesTecnicos.set(p.outros_envolvidos_assistentes_tecnicos.map((o) => ({ ...o })));
    this.advSelecionado.set(-1);
    this.magSelecionado.set(-1);
    this.testSelecionado.set(-1);
    this.peritoSelecionado.set(-1);
    this.assistTecSelecionado.set(-1);
    this.limparRascunhos();
  }

  /** Zera a aba (novo cadastro). */
  limpar(): void {
    this.advogados.set([]);
    this.magistrados.set([]);
    this.testemunhas.set([]);
    this.peritos.set([]);
    this.assistentesTecnicos.set([]);
    this.advSelecionado.set(-1);
    this.magSelecionado.set(-1);
    this.testSelecionado.set(-1);
    this.peritoSelecionado.set(-1);
    this.assistTecSelecionado.set(-1);
    this.limparRascunhos();
  }

  /** Entrega as cinco listas pro payload de escrita. */
  coletar(): OutrosEnvolvidosValores {
    return {
      outrosEnvolvidosAdvogados: this.advogados(),
      outrosEnvolvidosMagistrados: this.magistrados().map((m) => ({
        magistrado_id: m.magistrado!.id,
        resultado: m.resultado,
        orgao_id: m.orgao?.id ?? null,
        data: m.data,
      })),
      outrosEnvolvidosTestemunhas: this.testemunhas(),
      outrosEnvolvidosPeritos: this.peritos().map((pe) => ({
        perito_id: pe.perito!.id,
        resultado: pe.resultado,
      })),
      outrosEnvolvidosAssistentesTecnicos: this.assistentesTecnicos(),
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
    return [o.magistrado?.nome, o.resultado, o.orgao?.nome, this.dataBr(o.data)]
      .map((v) => v?.trim() || '—')
      .join(' | ');
  }

  protected adicionarMagistrado(): void {
    const magistrado = this.magistradoAtual();
    if (!magistrado) {
      this.erro.emit('Selecione um magistrado do catálogo (use o "+" pra cadastrar um novo).');
      return;
    }
    const data = this.magForm.controls.data.value.trim();
    if (!data) {
      this.magForm.markAllAsTouched();
      return;
    }
    const item = this.orgaosDoTribunalRascunhoMag().find((o) => o.descricao === this.orgaoRascunhoMag());
    const orgao = item ? this.orgaoService.orgaos().find((o) => o.id === item.id) : undefined;
    this.magistrados.update((atual) => [
      ...atual,
      {
        magistrado: { id: magistrado.id, nome: magistrado.nome },
        resultado: this.resultadoRascunho().trim() || null,
        orgao: orgao ? { id: orgao.id, nome: orgao.nome, tribunal_id: orgao.tribunal_id } : null,
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

  /** Abre o diálogo de arquivos daquele magistrado (botão na própria linha, não depende de seleção). */
  protected abrirPastaMagistrado(magistrado: { id: number; nome: string }): void {
    this.pastaMagistradoService.abrir(magistrado);
  }

  /** `(itemSelected)` do dropdown — item cru (`/domain`, camelCase) ou `null` (limpou a seleção). */
  protected onMagistradoSelected(item: Record<string, unknown> | null): void {
    this.magistradoAtual.set(item ? { id: Number(item['id']), nome: String(item['nome'] ?? '') } : null);
  }

  // ===================== lista de testemunhas =====================

  /** Linha do listbox: "TESTEMUNHA | CPF | PARTE INTERESSADA" (CPF vazio vira "—"). */
  protected rotuloTestemunha(o: OutroEnvolvidoTestemunhaApi): string {
    return `${o.testemunha} | ${o.cpf ? maskCpf(o.cpf) : '—'} | ${o.parte_interessada}`;
  }

  protected adicionarTestemunha(): void {
    const testemunha = this.testForm.controls.testemunha.value.trim();
    const parte = this.parteRascunho().trim();
    if (!testemunha || !parte || this.testForm.controls.cpf.invalid) {
      this.testForm.markAllAsTouched();
      return;
    }
    const cpf = onlyDigits(this.testForm.controls.cpf.value) || null;
    this.testemunhas.update((atual) => [...atual, { testemunha, cpf, parte_interessada: parte }]);
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

  // ===================== lista de peritos =====================

  /** Linha do listbox: "PERITO | CPF | RESULTADO" (campo vazio vira "—"). */
  protected rotuloPerito(o: OutroEnvolvidoPeritoApi): string {
    const cpf = o.perito?.cpf;
    return `${o.perito?.nome ?? '—'} | ${cpf ? maskCpf(cpf) : '—'} | ${o.resultado?.trim() || '—'}`;
  }

  protected adicionarPerito(): void {
    const perito = this.peritoAtual();
    if (!perito) {
      this.erro.emit('Selecione um perito do catálogo (use o "+" pra cadastrar um novo).');
      return;
    }
    this.peritos.update((atual) => [
      ...atual,
      {
        perito: { id: perito.id, nome: perito.nome, cpf: perito.cpf },
        resultado: this.resultadoRascunhoPerito().trim() || null,
      },
    ]);
    this.limparRascunhoPerito();
  }

  protected removerPerito(): void {
    const i = this.peritoSelecionado();
    if (i < 0) {
      return;
    }
    this.peritos.update((atual) => atual.filter((_, idx) => idx !== i));
    this.peritoSelecionado.set(-1);
  }

  protected selecionarPerito(indice: number): void {
    this.peritoSelecionado.update((atual) => (atual === indice ? -1 : indice));
  }

  /** Abre o diálogo de arquivos daquele perito (botão na própria linha, não depende de seleção). */
  protected abrirPastaPerito(perito: { id: number; nome: string }): void {
    this.pastaPeritoService.abrir(perito);
  }

  /** `(itemSelected)` do dropdown de perito — item cru (`/domain`, camelCase) ou `null`. */
  protected onPeritoSelected(item: Record<string, unknown> | null): void {
    this.peritoAtual.set(
      item
        ? { id: Number(item['id']), nome: String(item['nome'] ?? ''), cpf: (item['cpf'] as string | null) ?? null }
        : null,
    );
  }

  // ===================== lista de assistentes técnicos =====================

  /** Linha do listbox: "ASSISTENTE TÉCNICO | CPF | PARTE INTERESSADA" (CPF vazio vira "—"). */
  protected rotuloAssistenteTecnico(o: OutroEnvolvidoAssistenteTecnicoApi): string {
    return `${o.assistente_tecnico} | ${o.cpf ? maskCpf(o.cpf) : '—'} | ${o.parte_interessada}`;
  }

  protected adicionarAssistenteTecnico(): void {
    const assistenteTecnico = this.assistTecForm.controls.assistenteTecnico.value.trim();
    const parte = this.parteRascunhoAssistTec().trim();
    if (!assistenteTecnico || !parte || this.assistTecForm.controls.cpf.invalid) {
      this.assistTecForm.markAllAsTouched();
      return;
    }
    const cpf = onlyDigits(this.assistTecForm.controls.cpf.value) || null;
    this.assistentesTecnicos.update((atual) => [
      ...atual,
      { assistente_tecnico: assistenteTecnico, cpf, parte_interessada: parte },
    ]);
    this.limparRascunhoAssistenteTecnico();
  }

  protected removerAssistenteTecnico(): void {
    const i = this.assistTecSelecionado();
    if (i < 0) {
      return;
    }
    this.assistentesTecnicos.update((atual) => atual.filter((_, idx) => idx !== i));
    this.assistTecSelecionado.set(-1);
  }

  protected selecionarAssistenteTecnico(indice: number): void {
    this.assistTecSelecionado.update((atual) => (atual === indice ? -1 : indice));
  }

  // ===================== catálogos (só "adicionar" aqui) =====================

  protected criarPosicao(nome: string): void {
    this.criarCatalogo('posicao-cliente', nome, (p) => this.posicaoRascunho.set(p.nome));
  }

  protected criarMagistrado(nome: string): void {
    this.criarCatalogo('magistrado', nome, (m) => this.magistradoAtual.set(m));
  }

  /**
   * `Magistrado` é o único catálogo desta aba que também permite renomear/excluir pelo "⋮" (os
   * demais são só "adicionar" — ver comentário da seção). Como o dropdown trabalha por id aqui
   * (`magistrado_id` é FK real), `de`/`valor` já chegam como o id — sem precisar achar por nome.
   */
  protected renomearMagistrado({ de, para }: { de: string; para: string }): void {
    const id = Number(de);
    this.processoService.renomearCatalogo('magistrado', id, para).subscribe({
      next: (m) => {
        if (this.magistradoAtual()?.id === id) {
          this.magistradoAtual.set(m);
        }
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected excluirMagistrado(valor: string): void {
    const id = Number(valor);
    this.processoService.excluirCatalogo('magistrado', id).subscribe({
      next: () => {
        if (this.magistradoAtual()?.id === id) {
          this.magistradoAtual.set(null);
        }
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected criarResultado(nome: string): void {
    this.criarCatalogo('resultado-decisao', nome, (r) => this.resultadoRascunho.set(r.nome));
  }

  protected criarResultadoPerito(nome: string): void {
    this.criarCatalogo('resultado-decisao', nome, (r) => this.resultadoRascunhoPerito.set(r.nome));
  }

  /** Cria um item num catálogo simples (`id`, `nome`) via `/domain/{entityName}`. */
  private criarCatalogo(entityName: string, nome: string, aoCriar: (item: CatalogoItem) => void): void {
    this.processoService.criarCatalogo(entityName, nome).subscribe({
      next: (item) => aoCriar(item),
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  /** O "+" do combobox de perito abre este mini-formulário (nome + CPF) em vez de criar direto. */
  protected abrirNovoPerito(nomeSugerido: string): void {
    this.novoPeritoForm.reset();
    this.novoPeritoForm.controls.nome.setValue(nomeSugerido);
    this.novoPeritoAberto.set(true);
  }

  protected cancelarNovoPerito(): void {
    this.novoPeritoAberto.set(false);
    this.novoPeritoForm.reset();
  }

  protected confirmarNovoPerito(): void {
    const nome = this.novoPeritoForm.controls.nome.value.trim();
    if (!nome || this.novoPeritoForm.controls.cpf.invalid) {
      this.novoPeritoForm.markAllAsTouched();
      return;
    }
    const cpf = onlyDigits(this.novoPeritoForm.controls.cpf.value) || null;
    this.domainService
      .post<{ nome: string; cpf: string | null }>({ entityName: 'perito', body: { nome, cpf } })
      .pipe(
        switchMap((criado) =>
          this.domainService.get<PeritoItem>({ entityName: 'perito', entityId: criado.id, fields: 'id,nome,cpf' }),
        ),
      )
      .subscribe({
        next: (p) => {
          this.peritoAtual.set(p);
          this.novoPeritoAberto.set(false);
          this.novoPeritoForm.reset();
        },
        error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
      });
  }

  protected onTribunalRascunhoMagChange(nome: string): void {
    this.tribunalRascunhoMag.set(nome);
    this.orgaoRascunhoMag.set(''); // troca de tribunal invalida o órgão escolhido antes
  }

  protected criarTribunalMagistrado(nome: string): void {
    this.tribunalService.criar(nome).subscribe({
      next: (t) => this.onTribunalRascunhoMagChange(t.nome),
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected renomearTribunalMagistrado({ de, para }: { de: string; para: string }): void {
    const alvo = this.tribunalService.tribunais().find((t) => t.nome === de);
    if (!alvo) {
      return;
    }
    this.tribunalService.alterar(alvo.id, para).subscribe({
      next: (t) => {
        if (this.tribunalRascunhoMag() === de) {
          this.tribunalRascunhoMag.set(t.nome);
        }
        // "TRIBUNAL - descrição" dos órgãos embutia o nome antigo — recarrega pra atualizar.
        this.orgaoService.recarregar();
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected excluirTribunalMagistrado(nome: string): void {
    const alvo = this.tribunalService.tribunais().find((t) => t.nome === nome);
    if (!alvo) {
      return;
    }
    this.tribunalService.excluir(alvo.id).subscribe({
      next: () => {
        if (this.tribunalRascunhoMag() === nome) {
          this.onTribunalRascunhoMagChange('');
        }
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected criarOrgaoDoTribunalRascunhoMag(descricao: string): void {
    const tribunal = this.tribunalRascunhoMag().trim();
    if (!tribunal || !descricao.trim()) {
      return;
    }
    this.orgaoService.criar(`${tribunal} - ${descricao.trim()}`).subscribe({
      next: (criado) => {
        const prefixo = `${tribunal} - `;
        this.orgaoRascunhoMag.set(
          criado.nome.startsWith(prefixo) ? criado.nome.slice(prefixo.length) : criado.nome,
        );
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected renomearOrgaoDoTribunalRascunhoMag({ de, para }: { de: string; para: string }): void {
    const item = this.orgaosDoTribunalRascunhoMag().find((o) => o.descricao === de);
    const tribunal = this.tribunalRascunhoMag().trim();
    if (!item || !tribunal) {
      return;
    }
    this.orgaoService.alterar(item.id, `${tribunal} - ${para.trim()}`).subscribe({
      next: (atualizado) => {
        if (this.orgaoRascunhoMag() === de) {
          const prefixo = `${tribunal} - `;
          this.orgaoRascunhoMag.set(
            atualizado.nome.startsWith(prefixo) ? atualizado.nome.slice(prefixo.length) : atualizado.nome,
          );
        }
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected excluirOrgaoDoTribunalRascunhoMag(descricao: string): void {
    const item = this.orgaosDoTribunalRascunhoMag().find((o) => o.descricao === descricao);
    if (!item) {
      return;
    }
    this.orgaoService.excluir(item.id).subscribe({
      next: () => {
        if (this.orgaoRascunhoMag() === descricao) {
          this.orgaoRascunhoMag.set('');
        }
      },
      error: (err: unknown) => this.erro.emit(this.mensagemErroHttp(err)),
    });
  }

  protected criarParte(nome: string): void {
    this.criarCatalogo('parte-interessada', nome, (p) => this.parteRascunho.set(p.nome));
  }

  protected criarParteAssistTec(nome: string): void {
    this.criarCatalogo('parte-interessada', nome, (p) => this.parteRascunhoAssistTec.set(p.nome));
  }

  // ===================== helpers =====================

  private limparRascunhos(): void {
    this.limparRascunhoAdvogado();
    this.limparRascunhoMagistrado();
    this.limparRascunhoTestemunha();
    this.limparRascunhoPerito();
    this.limparRascunhoAssistenteTecnico();
  }

  private limparRascunhoAdvogado(): void {
    this.advForm.reset();
    this.posicaoRascunho.set('');
    this.ufRascunho.set('');
  }

  private limparRascunhoMagistrado(): void {
    this.magForm.reset();
    this.magistradoAtual.set(null);
    this.resultadoRascunho.set('');
    this.tribunalRascunhoMag.set('');
    this.orgaoRascunhoMag.set('');
  }

  private limparRascunhoTestemunha(): void {
    this.testForm.reset();
    this.parteRascunho.set('');
  }

  private limparRascunhoPerito(): void {
    this.peritoAtual.set(null);
    this.resultadoRascunhoPerito.set('');
  }

  private limparRascunhoAssistenteTecnico(): void {
    this.assistTecForm.reset();
    this.parteRascunhoAssistTec.set('');
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
