import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  CreateBudgetCategoryDto,
  CreateCommitmentDto,
  CreateGoalDto,
  UpdateBudgetCategoryDto,
  UpdateCommitmentDto,
  UpdateGoalDto,
} from './planning.dto.js';
import { PlanningService } from './planning.service.js';

@Controller('planning')
export class PlanningController {
  constructor(private readonly planning: PlanningService) {}

  /** Categorias, compromissos, metas e a projeção dos próximos 6 meses. */
  @Get()
  overview() {
    return this.planning.overview();
  }

  @Post('commitments')
  createCommitment(@Body() dto: CreateCommitmentDto) {
    return this.planning.createCommitment(dto);
  }

  @Patch('commitments/:id')
  updateCommitment(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCommitmentDto) {
    return this.planning.updateCommitment(id, dto);
  }

  @Delete('commitments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteCommitment(@Param('id', ParseUUIDPipe) id: string) {
    return this.planning.deleteCommitment(id);
  }

  @Post('goals')
  createGoal(@Body() dto: CreateGoalDto) {
    return this.planning.createGoal(dto);
  }

  @Patch('goals/:id')
  updateGoal(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateGoalDto) {
    return this.planning.updateGoal(id, dto);
  }

  @Delete('goals/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteGoal(@Param('id', ParseUUIDPipe) id: string) {
    return this.planning.deleteGoal(id);
  }

  @Post('categories')
  createCategory(@Body() dto: CreateBudgetCategoryDto) {
    return this.planning.createCategory(dto);
  }

  @Patch('categories/:id')
  updateCategory(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBudgetCategoryDto) {
    return this.planning.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.planning.deleteCategory(id);
  }
}
