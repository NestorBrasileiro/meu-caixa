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
import { CurrentUser } from '../auth/current-user.decorator.js';
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
  overview(@CurrentUser() userId: string) {
    return this.planning.overview(userId);
  }

  @Post('commitments')
  createCommitment(@CurrentUser() userId: string, @Body() dto: CreateCommitmentDto) {
    return this.planning.createCommitment(userId, dto);
  }

  @Patch('commitments/:id')
  updateCommitment(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCommitmentDto,
  ) {
    return this.planning.updateCommitment(userId, id, dto);
  }

  @Delete('commitments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteCommitment(@CurrentUser() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.planning.deleteCommitment(userId, id);
  }

  @Post('goals')
  createGoal(@CurrentUser() userId: string, @Body() dto: CreateGoalDto) {
    return this.planning.createGoal(userId, dto);
  }

  @Patch('goals/:id')
  updateGoal(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGoalDto,
  ) {
    return this.planning.updateGoal(userId, id, dto);
  }

  @Delete('goals/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteGoal(@CurrentUser() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.planning.deleteGoal(userId, id);
  }

  @Post('categories')
  createCategory(@CurrentUser() userId: string, @Body() dto: CreateBudgetCategoryDto) {
    return this.planning.createCategory(userId, dto);
  }

  @Patch('categories/:id')
  updateCategory(
    @CurrentUser() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBudgetCategoryDto,
  ) {
    return this.planning.updateCategory(userId, id, dto);
  }

  @Delete('categories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteCategory(@CurrentUser() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.planning.deleteCategory(userId, id);
  }
}
