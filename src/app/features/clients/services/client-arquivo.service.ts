import { HttpClient, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { ClientArquivo, ClientArquivoApi, clientArquivoFromApi } from './client-arquivo.model';

/**
 * Arquivos de uma pessoa — sub-recurso `/api/v1/pessoas/{pessoaId}/arquivos`
 * (Spring). O binário é gravado no disco da API; aqui trafegam só metadados e o
 * download. Relação 1:N; a listagem vem com o mais recente primeiro.
 */
@Injectable({ providedIn: 'root' })
export class ClientArquivoService {
  private readonly http = inject(HttpClient);

  private url(pessoaId: number): string {
    return `${environment.apiBaseUrl}/pessoas/${pessoaId}/arquivos`;
  }

  listar(pessoaId: number): Observable<ClientArquivo[]> {
    return this.http
      .get<ClientArquivoApi[]>(this.url(pessoaId))
      .pipe(map((lista) => lista.map(clientArquivoFromApi)));
  }

  enviar(pessoaId: number, arquivo: File, tipoAnexoId: number): Observable<ClientArquivo> {
    const form = new FormData();
    form.append('arquivo', arquivo);
    form.append('tipoAnexoId', String(tipoAnexoId));
    return this.http.post<ClientArquivoApi>(this.url(pessoaId), form).pipe(map(clientArquivoFromApi));
  }

  baixar(pessoaId: number, arquivoId: number): Observable<HttpResponse<Blob>> {
    return this.http.get(`${this.url(pessoaId)}/${arquivoId}`, {
      observe: 'response',
      responseType: 'blob',
    });
  }

  remover(pessoaId: number, arquivoId: number): Observable<void> {
    return this.http.delete<void>(`${this.url(pessoaId)}/${arquivoId}`);
  }
}
