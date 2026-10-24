import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, isNull, sql } from 'drizzle-orm';
import type { AuthUser, KeycloakUser } from '../auth/auth.types.js';
import { DATABASE, type Database } from '../database/database.module.js';
import { users } from '../database/schema.js';

/**
 * Usuários do app, criados no primeiro acesso de cada pessoa do Keycloak. O
 * `id` do banco (não o `sub`) é o dono de todos os dados.
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async toAuthUser(identity: KeycloakUser): Promise<AuthUser> {
    const { sub, ...profile } = identity;
    return { ...profile, id: await this.resolve(identity), keycloakId: sub };
  }

  /**
   * Id do usuário no banco, criando-o no primeiro acesso. Roda a cada
   * requisição (uma leitura por índice, bem mais barata que a introspecção no
   * Keycloak); só escreve quando nome, usuário ou e-mail mudaram.
   */
  async resolve(identity: KeycloakUser): Promise<string> {
    const profile = { username: identity.username, name: identity.name, email: identity.email };
    const [existing] = await this.db
      .select({ id: users.id, username: users.username, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.keycloakId, identity.sub));
    if (existing) {
      const changed = (Object.keys(profile) as (keyof Profile)[]).some(
        (key) => existing[key] !== profile[key],
      );
      if (changed) {
        await this.db
          .update(users)
          .set({ ...profile, updatedAt: new Date() })
          .where(eq(users.id, existing.id));
      }
      return existing.id;
    }
    return (
      (await this.claimLegacy(identity.sub, profile)) ?? (await this.create(identity.sub, profile))
    );
  }

  /**
   * A migration 0007 cria um usuário sem `keycloak_id` para os dados de antes
   * do multiusuário quando não sabe de quem são. O primeiro login assume essa
   * linha (o `where` torna isso atômico: só um consegue).
   */
  private async claimLegacy(sub: string, profile: Profile): Promise<string | undefined> {
    const [claimed] = await this.db
      .update(users)
      .set({ keycloakId: sub, ...profile, updatedAt: new Date() })
      .where(isNull(users.keycloakId))
      .returning({ id: users.id });
    if (claimed) {
      this.logger.warn(
        `Dados de antes do multiusuário atribuídos a ${profile.username ?? sub} (primeiro login)`,
      );
    }
    return claimed?.id;
  }

  private async create(sub: string, profile: Profile): Promise<string> {
    // Duas requisições do mesmo usuário novo ao mesmo tempo: a segunda só lê.
    const [row] = await this.db
      .insert(users)
      .values({ keycloakId: sub, ...profile })
      .onConflictDoUpdate({ target: users.keycloakId, set: { updatedAt: sql`now()` } })
      .returning({ id: users.id });
    return row!.id;
  }
}

type Profile = Pick<KeycloakUser, 'username' | 'name' | 'email'>;
