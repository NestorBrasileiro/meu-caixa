import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/** Libera a rota do `AuthGuard` (sem login). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
