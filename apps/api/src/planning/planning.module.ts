import { Module } from '@nestjs/common';
import { PlanningController } from './planning.controller.js';
import { PlanningService } from './planning.service.js';

/**
 * O coração do planejamento: compromissos fixos (ex.: parcela do terreno),
 * metas (ex.: entrada do carro), categorias de orçamento e projeções.
 */
@Module({
  controllers: [PlanningController],
  providers: [PlanningService],
})
export class PlanningModule {}
