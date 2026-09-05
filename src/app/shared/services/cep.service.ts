import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';

import { environment } from '../../../environments/environment';

/** `EnderecoPorCepResponse` do backend (`GET /api/v1/ceps/{cep}`). */
export interface EnderecoPorCepApi {
  cep: string;
  logradouro: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
}

/**
 * Autopreenchimento de endereço por CEP — a busca de verdade (ViaCEP) acontece no backend
 * (`CepService`/`CepController`), aqui só chama e devolve `null` em qualquer falha (CEP
 * inexistente, mal formado, backend fora do ar) pra quem chama tratar como "não achou, usuário
 * preenche manualmente", sem propagar erro pro formulário.
 */
@Injectable({ providedIn: 'root' })
export class CepService {
  private readonly http = inject(HttpClient);

  buscar(cep: string): Observable<EnderecoPorCepApi | null> {
    return this.http
      .get<EnderecoPorCepApi>(`${environment.apiBaseUrl}/ceps/${cep}`)
      .pipe(catchError(() => of(null)));
  }
}
