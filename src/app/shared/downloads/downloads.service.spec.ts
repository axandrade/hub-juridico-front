import { HttpEvent, HttpEventType, HttpResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { DownloadsService } from './downloads.service';

describe('DownloadsService', () => {
  let service: DownloadsService;
  let eventos$: Subject<HttpEvent<Blob>>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [DownloadsService] });
    service = TestBed.inject(DownloadsService);
    eventos$ = new Subject<HttpEvent<Blob>>();

    // O ambiente de teste pode não ter essas APIs — garante que existam antes de espionar.
    const u = URL as unknown as Record<string, unknown>;
    u['createObjectURL'] ??= () => '';
    u['revokeObjectURL'] ??= () => undefined;

    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('acompanhar cria a tarefa, avança no progresso e conclui na resposta', () => {
    service.acompanhar('Processo.zip', eventos$);

    expect(service.tarefas().length).toBe(1);
    expect(service.tarefas()[0].status).toBe('preparando');
    expect(service.quantidadeAtivas()).toBe(1);

    eventos$.next({ type: HttpEventType.DownloadProgress, loaded: 2048, total: undefined });
    expect(service.tarefas()[0].status).toBe('baixando');
    expect(service.tarefas()[0].recebidoBytes).toBe(2048);

    const blob = new Blob(['PK...'], { type: 'application/zip' });
    eventos$.next(new HttpResponse({ body: blob }));

    expect(service.tarefas()[0].status).toBe('concluido');
    expect(service.quantidadeAtivas()).toBe(0);
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled();
  });

  it('erro no fluxo marca a tarefa como erro', () => {
    service.acompanhar('x.zip', eventos$);
    eventos$.error(new Error('falhou'));
    expect(service.tarefas()[0].status).toBe('erro');
    expect(service.quantidadeAtivas()).toBe(0);
  });

  it('cancelar aborta a assinatura e marca como cancelado', () => {
    const id = service.acompanhar('x.zip', eventos$);
    expect(eventos$.observed).toBe(true);

    service.cancelar(id);

    expect(eventos$.observed).toBe(false);
    expect(service.tarefas()[0].status).toBe('cancelado');
  });

  it('limparEncerradas mantém só as tarefas ativas', () => {
    service.acompanhar('ativa.zip', new Subject<HttpEvent<Blob>>());
    const idErro = service.acompanhar('erro.zip', eventos$);
    eventos$.error(new Error('x'));

    service.limparEncerradas();

    expect(service.tarefas().length).toBe(1);
    expect(service.tarefas().some((t) => t.id === idErro)).toBe(false);
  });
});
