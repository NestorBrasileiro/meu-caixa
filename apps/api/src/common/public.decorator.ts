import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/** Libera a rota do `ApiTokenGuard`. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
