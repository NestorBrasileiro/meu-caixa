import { Global, Module } from '@nestjs/common';
import { UsersService } from './users.service.js';

/** Global: o guard da sessão e o verificador do MCP resolvem o usuário em qualquer módulo. */
@Global()
@Module({
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
