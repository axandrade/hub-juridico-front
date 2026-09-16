import { Injectable, inject } from '@angular/core';
import { Observable, map, of } from 'rxjs';

import { AuthService } from './auth.service';
import { DomainService, IDomainPage } from './domain.service';

/**
 * Favoritar genérico para qualquer entidade servida via `/domain/{entityName}` — a própria
 * entidade `Favorito` (usuarioId/tipoEntidade/entidadeId, já existia pro `FavoritoService`
 * "clássico" usado por Pessoa/Clientes) é exposta automaticamente em `/domain/favorito` como
 * qualquer outra `@Entity` (auto-expose, decisão #1 do ddd-noap) — sem controller Spring
 * dedicado nenhum, 100% pelo CRUD genérico (`DomainService.get/post/delete`). `tipoEntidade`
 * aqui é sempre o `entityName` do `DomainModelTableComponent`, então os dois conceitos
 * coincidem 1:1.
 *
 * LIMITAÇÃO CONHECIDA: `/domain/**` não injeta "usuário atual" automaticamente (não é bean
 * Spring por request, é reflection direto na entidade) — o `usuarioId` vai explícito no
 * filtro/corpo, montado aqui a partir do usuário logado (`AuthService`). Isso significa que
 * qualquer ADMIN autenticado (só ADMIN acessa `/domain/**` — ver SecurityConfig) poderia, em
 * tese, favoritar/consultar em nome de outro usuarioId. Aceitável para este piloto; se
 * `/domain/**` for aberto além de ADMIN um dia, isso precisa de um método `@Create`/`@Update`
 * na própria entidade validando o usuário contra o JWT (ver `Context.getCurrentUser()`).
 */
@Injectable({ providedIn: 'root' })
export class DomainFavoritoService {
  private readonly domainService = inject(DomainService);
  private readonly authService = inject(AuthService);

  /** Ids favoritados dentre os informados, mapeados pro id da própria linha `Favorito` (necessário pra desfavoritar). */
  listarFavoritos(tipoEntidade: string, entidadeIds: number[]): Observable<Map<number, number>> {
    if (entidadeIds.length === 0) {
      return of(new Map());
    }
    const usuarioId = this.currentUserId();
    // Ordem importa: RQL não tem parênteses, avalia da esquerda pra direita (decisão #4 do
    // ddd-noap) — todos os "or" primeiro, "and" por último, pra virar
    // ((entidadeId=a OR entidadeId=b) AND usuarioId=x) AND tipoEntidade=y, não o contrário.
    const orEntidadeIds = entidadeIds.map((id) => `entidadeId eq ${id}`).join(' or ');
    const filter = `${orEntidadeIds} and usuarioId eq ${usuarioId} and tipoEntidade eq '${tipoEntidade}'`;
    return this.domainService
      .get<IDomainPage<{ id: number; entidadeId: number }>>({
        entityName: 'favorito',
        filter,
        fields: 'id,entidadeId',
        size: entidadeIds.length,
      })
      .pipe(map((page) => new Map(page.content.map((f) => [f.entidadeId, f.id]))));
  }

  favoritar(tipoEntidade: string, entidadeId: number): Observable<number> {
    const usuarioId = this.currentUserId();
    return this.domainService
      .post({
        entityName: 'favorito',
        body: { usuario_id: usuarioId, tipo_entidade: tipoEntidade, entidade_id: entidadeId },
      })
      .pipe(map((created) => created.id));
  }

  desfavoritar(favoritoId: number): Observable<void> {
    return this.domainService.delete({ entityName: 'favorito', entityId: favoritoId });
  }

  private currentUserId(): number {
    const id = this.authService.user()?.id;
    if (id == null) {
      throw new Error('Usuário não autenticado.');
    }
    return id;
  }
}
