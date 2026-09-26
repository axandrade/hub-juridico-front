import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { firstValueFrom, of } from 'rxjs';

import { DomainService } from '../../../core/services/domain.service';
import { MonitoramentoService } from './monitoramento.service';

describe('MonitoramentoService — novidades', () => {
  let domain: { postServiceMethod: ReturnType<typeof vi.fn> };
  let service: MonitoramentoService;

  beforeEach(() => {
    domain = { postServiceMethod: vi.fn(() => of([{ id: 7, total: 3 }, { id: 9, total: 1 }])) };
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), { provide: DomainService, useValue: domain }],
    });
    service = TestBed.inject(MonitoramentoService);
  });

  it('por monitoramento: /domain/service/monitoramento-service, lista virando {id: total}', async () => {
    const mapa = await firstValueFrom(service.novidadesPorMonitoramento());

    expect(domain.postServiceMethod).toHaveBeenCalledWith({
      serviceName: 'monitoramento-service',
      method: 'novidades-por-monitoramento',
    });
    expect(mapa).toEqual({ 7: 3, 9: 1 });
  });

  it('"Atualizar" também vai pelo /domain/service, com o id do monitoramento', async () => {
    domain.postServiceMethod.mockReturnValue(of(null));

    expect(await firstValueFrom(service.situacaoAtualizacao(4))).toBeNull();
    service.iniciarAtualizacao(4).subscribe();
    service.cancelarAtualizacao(4).subscribe();

    const metodos = domain.postServiceMethod.mock.calls.map(([c]) => [c.method, c.args]);
    expect(metodos).toEqual([
      ['situacao-atualizacao', { monitoramentoId: 4 }],
      ['iniciar-atualizacao', { monitoramentoId: 4 }],
      ['cancelar-atualizacao', { monitoramentoId: 4 }],
    ]);
  });

  it('dentro do monitoramento: manda o id do monitoramento como argumento nomeado', async () => {
    const mapa = await firstValueFrom(service.novidadesDoMonitoramento(4));

    expect(domain.postServiceMethod).toHaveBeenCalledWith({
      serviceName: 'monitoramento-service',
      method: 'novidades-do-monitoramento',
      args: { monitoramentoId: 4 },
    });
    expect(mapa[7]).toBe(3);
  });
});
