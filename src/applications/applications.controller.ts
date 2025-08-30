import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';
import { AdminGuard } from '../auth/admin.guard';
import { UpdateApplicationItemStartDateDto } from './dto/update-application-item-start-date.dto';
import { GetUserApplicationQueryDto } from './dto/get-user-application-query.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserId } from '../auth/user-id.decorator';

@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Get(':id')
  async findOneById(
    @Param('id') id: string,
    @Query('withProgram') withProgram?: string,
  ) {
    const flag = withProgram === 'true' || withProgram === '1';
    return this.applicationsService.findOneById(id, flag);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() dto: CreateApplicationDto, @UserId() userId: string) {
    return this.applicationsService.create(dto, userId);
  }

  @Get('user/:userId')
  async findByUser(
    @Param('userId') userId: string,
    @Query() query: GetUserApplicationQueryDto,
  ) {
    return this.applicationsService.findByUser(userId, query);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateApplicationStatusDto,
  ) {
    return this.applicationsService.updateStatus(id, dto.status);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch(':id/items/:itemId/start-date')
  async updateItemStartDate(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateApplicationItemStartDateDto,
  ) {
    return this.applicationsService.updateItemStartDate(
      id,
      itemId,
      dto.startDate,
    );
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch(':id/items/:itemId/clear-dates')
  async clearItemDates(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.applicationsService.clearItemDates(id, itemId);
  }
}
