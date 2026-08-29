import { Injectable } from '@angular/core';
import { Observable, delay, of } from 'rxjs';

import { MOCK_CLIENTS, MOCK_COMMITMENTS, MOCK_PROCESSES, MOCK_TASKS } from '../data/mock-data';
import { IClient, ICommitment, IProcess, ITask } from '../models';

/**
 * Fonte única de dados da aplicação. Hoje serve dados mock com um pequeno
 * atraso simulado; a troca por HttpClient é transparente para os consumidores.
 */
@Injectable({ providedIn: 'root' })
export class DataService {
  private readonly latencyMs = 350;

  getTasks(): Observable<ITask[]> {
    return of(structuredClone(MOCK_TASKS)).pipe(delay(this.latencyMs));
  }

  getCommitments(): Observable<ICommitment[]> {
    return of(structuredClone(MOCK_COMMITMENTS)).pipe(delay(this.latencyMs));
  }

  getProcesses(): Observable<IProcess[]> {
    return of(structuredClone(MOCK_PROCESSES)).pipe(delay(this.latencyMs));
  }

  getClients(): Observable<IClient[]> {
    return of(structuredClone(MOCK_CLIENTS)).pipe(delay(this.latencyMs));
  }
}
