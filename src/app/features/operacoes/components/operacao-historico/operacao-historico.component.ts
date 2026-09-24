import { formatDate } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';

import { DATE_FORMAT } from '../../../../core/constants/app-constants';
import { DomainService, IDomainPage } from '../../../../core/services/domain.service';
import { DateFormatPipe } from '../../../../shared/pipes/date-format.pipe';
import {
  ORIGEM_OPERACAO_LABEL,
  OrigemOperacao,
  STATUS_OPERACAO_LABEL,
  StatusOperacao,
  TIPO_OPERACAO_LABEL,
  TipoOperacao,
} from '../../services/operacao-api.model';

const ENTITY = 'operacao-historico';

const CAMPO_LABEL: Record<string, string> = {
  tipo: 'Tipo',
  titulo: 'Título',
  prazoFatal: 'Prazo fatal',
  horaInicio: 'Hora início',
  horaFim: 'Hora fim',
  importancia: 'Importância',
  origem: 'Origem',
  link: 'Link',
  teor: 'Teor',
  providencia: 'Providência',
  responsavelId: 'Responsável',
  status: 'Status',
  ativo: 'Ativo',
  comentario: 'Comentário',
  anexo: 'Anexo',
  anexo_excluido: 'Anexo excluído',
  comentario_excluido: 'Comentário excluído',
};

/** `comentario`/`anexo`/`*_excluido` são eventos (só "aconteceu", sem anterior/novo) — os demais são mudança de campo. */
const CAMPOS_EVENTO = new Set(['comentario', 'anexo', 'anexo_excluido', 'comentario_excluido']);

/** `*_excluido` guarda o valor em `valorAnterior` (não sobrou "novo" nenhum) — os outros eventos usam `valorNovo`. */
const CAMPOS_EVENTO_USA_VALOR_ANTERIOR = new Set(['anexo_excluido', 'comentario_excluido']);

const ICONE_EVENTO: Record<string, string> = {
  comentario: 'fa-solid fa-comment',
  anexo: 'fa-solid fa-paperclip',
  anexo_excluido: 'fa-solid fa-trash-can',
  comentario_excluido: 'fa-solid fa-comment-slash',
};

interface OperacaoHistoricoRow {
  id: number;
  operacaoId: number;
  campo: string;
  valorAnterior: string | null;
  valorNovo: string | null;
  autorNome: string | null;
  alteradoEm: string;
}

interface HistoricoView extends OperacaoHistoricoRow {
  campoLabel: string;
  valorAnteriorLabel: string;
  valorNovoLabel: string;
  ehEvento: boolean;
  ehRemocao: boolean;
  icone: string;
}

/** Aba "Histórico" (só leitura): auditoria de campo de uma operação — ver `Operacao.atualizarOperacao()`/`OperacaoHistorico` no backend. */
@Component({
  selector: 'app-operacao-historico',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DateFormatPipe],
  templateUrl: './operacao-historico.component.html',
  styleUrl: './operacao-historico.component.scss',
})
export class OperacaoHistoricoComponent {
  private readonly domainService = inject(DomainService);
  private readonly nomesResponsaveis = new Map<number, string>();

  readonly operacaoId = input<number | null>(null);

  protected readonly carregando = signal(false);
  protected readonly historico = signal<HistoricoView[]>([]);
  protected readonly erro = signal('');

  constructor() {
    effect(() => {
      const operacaoId = this.operacaoId();
      untracked(() => {
        if (operacaoId === null) {
          this.historico.set([]);
          this.erro.set('');
          return;
        }
        this.carregar(operacaoId);
      });
    });
  }

  private carregar(operacaoId: number): void {
    this.carregando.set(true);
    this.erro.set('');
    this.domainService
      .get<IDomainPage<OperacaoHistoricoRow>>({
        entityName: ENTITY,
        fields: 'id,operacaoId,campo,valorAnterior,valorNovo,autorNome,alteradoEm',
        filter: `operacaoId eq ${operacaoId}`,
        sort: '-alteradoEm',
        size: 500,
      })
      .subscribe({
        next: (pagina) => {
          this.historico.set(
            pagina.content.map((linha) => ({
              ...linha,
              campoLabel: CAMPO_LABEL[linha.campo] ?? linha.campo,
              valorAnteriorLabel: this.formatarValor(linha.campo, linha.valorAnterior),
              valorNovoLabel: this.formatarValor(linha.campo, linha.valorNovo),
              ehEvento: CAMPOS_EVENTO.has(linha.campo),
              ehRemocao: CAMPOS_EVENTO_USA_VALOR_ANTERIOR.has(linha.campo),
              icone: ICONE_EVENTO[linha.campo] ?? '',
            })),
          );
          this.carregando.set(false);
          pagina.content
            .filter((linha) => linha.campo === 'responsavelId')
            .forEach((linha) => {
              this.resolverResponsavel(linha.id, 'valorAnteriorLabel', linha.valorAnterior);
              this.resolverResponsavel(linha.id, 'valorNovoLabel', linha.valorNovo);
            });
        },
        error: (err: unknown) => {
          this.carregando.set(false);
          this.erro.set(this.httpErrorMessage(err));
        },
      });
  }

  private resolverResponsavel(linhaId: number, campo: 'valorAnteriorLabel' | 'valorNovoLabel', valor: string | null): void {
    if (!valor) {
      return;
    }
    const responsavelId = Number(valor);
    if (this.nomesResponsaveis.has(responsavelId)) {
      this.atualizarLabel(linhaId, campo, this.nomesResponsaveis.get(responsavelId)!);
      return;
    }
    this.domainService
      .get<{ name: string }>({ entityName: 'user', entityId: responsavelId, fields: 'name' })
      .subscribe((u) => {
        const nome = u?.name ?? `#${responsavelId}`;
        this.nomesResponsaveis.set(responsavelId, nome);
        this.atualizarLabel(linhaId, campo, nome);
      });
  }

  private atualizarLabel(linhaId: number, campo: 'valorAnteriorLabel' | 'valorNovoLabel', valor: string): void {
    this.historico.update((lista) => lista.map((l) => (l.id === linhaId ? { ...l, [campo]: valor } : l)));
  }

  private formatarValor(campo: string, valor: string | null): string {
    if (valor === null || valor === '') {
      return '—';
    }
    switch (campo) {
      case 'tipo':
        return TIPO_OPERACAO_LABEL[valor as TipoOperacao] ?? valor;
      case 'status':
        return STATUS_OPERACAO_LABEL[valor as StatusOperacao] ?? valor;
      case 'origem':
        return ORIGEM_OPERACAO_LABEL[valor as OrigemOperacao] ?? valor;
      case 'ativo':
        return valor === 'true' ? 'Ativo' : 'Inativo';
      case 'prazoFatal': {
        const data = new Date(valor);
        return Number.isNaN(data.getTime()) ? valor : formatDate(data, DATE_FORMAT.LONG, DATE_FORMAT.LOCALE);
      }
      case 'responsavelId':
        return 'Carregando...';
      default:
        return valor;
    }
  }

  private httpErrorMessage(err: unknown): string {
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
