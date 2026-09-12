import { Injectable, signal } from '@angular/core';

export type ToastTipo = 'sucesso' | 'erro' | 'info';

export interface Toast {
  id: number;
  tipo: ToastTipo;
  mensagem: string;
}

const DURACAO_MS: Record<ToastTipo, number> = {
  sucesso: 4000,
  info: 4000,
  erro: 6000,
};

/**
 * Avisos globais (balãozinho no canto superior direito) — substitui as mensagens que antes
 * viviam no rodapé de cada painel. Único ponto de entrada pra qualquer tela mostrar feedback de
 * uma ação (salvo, erro, favoritado, etc.); estados que exigem ação inline do usuário (ex.:
 * "confirme para inativar") continuam no próprio painel, não aqui.
 */
interface TimerToast {
  timeoutId: ReturnType<typeof setTimeout>;
  /** Quanto falta pra fechar — usado pra retomar após uma pausa. */
  restanteMs: number;
  /** Quando o timer atual vai disparar — usado pra calcular `restanteMs` numa pausa. */
  expiraEm: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private proximoId = 1;
  private readonly timers = new Map<number, TimerToast>();

  readonly toasts = signal<Toast[]>([]);

  sucesso(mensagem: string): void {
    this.mostrar('sucesso', mensagem);
  }

  erro(mensagem: string): void {
    this.mostrar('erro', mensagem);
  }

  info(mensagem: string): void {
    this.mostrar('info', mensagem);
  }

  fechar(id: number): void {
    this.limparTimer(id);
    this.toasts.update((atual) => atual.filter((t) => t.id !== id));
  }

  /** Suspende o auto-fechamento — o mouse entrou no balãozinho. */
  pausar(id: number): void {
    const timer = this.timers.get(id);
    if (!timer) {
      return;
    }
    clearTimeout(timer.timeoutId);
    timer.restanteMs = timer.expiraEm - Date.now();
  }

  /** Retoma a contagem do tempo restante — o mouse saiu do balãozinho. */
  retomar(id: number): void {
    const timer = this.timers.get(id);
    if (!timer) {
      return;
    }
    timer.expiraEm = Date.now() + timer.restanteMs;
    timer.timeoutId = setTimeout(() => this.fechar(id), timer.restanteMs);
  }

  private mostrar(tipo: ToastTipo, mensagem: string): void {
    const id = this.proximoId++;
    this.toasts.update((atual) => [...atual, { id, tipo, mensagem }]);
    const duracaoMs = DURACAO_MS[tipo];
    this.timers.set(id, {
      timeoutId: setTimeout(() => this.fechar(id), duracaoMs),
      restanteMs: duracaoMs,
      expiraEm: Date.now() + duracaoMs,
    });
  }

  private limparTimer(id: number): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer.timeoutId);
      this.timers.delete(id);
    }
  }
}
