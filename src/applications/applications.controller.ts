import {
  Body,
  Controller,
  ForbiddenException,
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
import { AdminGuard } from '../auth/guards/admin.guard';
import { UpdateApplicationItemStartDateDto } from './dto/update-application-item-start-date.dto';
import { GetUserApplicationQueryDto } from './dto/get-user-application-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserId } from '../auth/decorators/user-id.decorator';
import { ListApplicationsQueryDto } from './dto/list-applications-query.dto';
import { OwnerOrAdminGuard } from '../auth/guards/owner-or-admin.guard';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApplicationResponseDto,
  ApplicationsListResponseDto,
  StatusHistoryListResponseDto,
  UpdateStatusResponseDto,
} from './dto/application-response.dto';
import {
  mapApplication,
  mapStatusHistory,
  mapUpdateStatusResult,
} from './mappers/application.mapper';

@ApiTags('applications')
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @UseGuards(JwtAuthGuard, OwnerOrAdminGuard)
  @Get(':id')
  @ApiOperation({ summary: 'Получить заявку по id' })
  @ApiQuery({
    name: 'withProgram',
    required: false,
    description: 'Подгрузить данные программы для элементов заявки',
    schema: {
      type: 'string',
      enum: ['true', 'false', '1', '0'],
    },
  })
  @ApiOkResponse({ type: ApplicationResponseDto })
  async findOneById(
    @Param('id') id: string,
    @Query('withProgram') withProgram?: string,
    @UserId() userId?: string,
  ): Promise<ApplicationResponseDto> {
    const flag = withProgram === 'true' || withProgram === '1';
    const app = await this.applicationsService.findOneById(id, flag);

    if (app && userId && String(app.user) !== userId) {
      throw new ForbiddenException('Access denied');
    }
    return mapApplication(app);
  }

  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Создать заявку' })
  @ApiBearerAuth()
  @ApiBody({ type: CreateApplicationDto })
  @ApiOkResponse({ type: ApplicationResponseDto })
  @Post()
  async create(
    @Body() dto: CreateApplicationDto,
    @UserId() userId: string,
  ): Promise<ApplicationResponseDto> {
    const created = await this.applicationsService.create(dto, userId);
    return mapApplication(created);
  }

  @UseGuards(JwtAuthGuard, OwnerOrAdminGuard)
  @Get('user/:userId')
  @ApiOperation({ summary: 'Список заявок пользователя' })
  @ApiBearerAuth()
  @ApiOkResponse({ type: ApplicationsListResponseDto })
  async findByUser(
    @Param('userId') userId: string,
    @Query() query: GetUserApplicationQueryDto,
  ): Promise<ApplicationsListResponseDto> {
    const res = await this.applicationsService.findByUser(userId, query);
    return {
      data: res.data.map(mapApplication),
      meta: res.meta,
    };
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch(':id/status')
  @ApiOperation({ summary: 'Изменить статус заявки (админ)' })
  @ApiBearerAuth()
  @ApiBody({ type: UpdateApplicationStatusDto })
  @ApiOkResponse({ type: UpdateStatusResponseDto })
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateApplicationStatusDto,
    @UserId() userId: string,
  ): Promise<UpdateStatusResponseDto> {
    const r = await this.applicationsService.updateStatus(
      id,
      dto.status,
      userId,
      dto.comment,
    );
    return mapUpdateStatusResult(r);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get(':id/status-history')
  @ApiOperation({ summary: 'История смены статусов (админ)' })
  @ApiBearerAuth()
  @ApiOkResponse({ type: StatusHistoryListResponseDto })
  async getStatusHistory(
    @Param('id') id: string,
  ): Promise<StatusHistoryListResponseDto> {
    const res = await this.applicationsService.findStatusHistory(id);
    return { data: mapStatusHistory(res.data) };
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch(':id/items/:itemId/start-date')
  @ApiOperation({
    summary: 'Установить дату начала элемента (админ, любые даты)',
  })
  @ApiBearerAuth()
  @ApiBody({ type: UpdateApplicationItemStartDateDto })
  @ApiOkResponse({ type: ApplicationResponseDto })
  async updateItemStartDate(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateApplicationItemStartDateDto,
  ): Promise<ApplicationResponseDto> {
    const updated = await this.applicationsService.updateItemStartDateAdmin(
      id,
      itemId,
      dto.startDate,
    );
    return mapApplication(updated);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch(':id/items/:itemId/clear-dates')
  @ApiOperation({ summary: 'Очистить даты элемента заявки (админ)' })
  @ApiBearerAuth()
  @ApiOkResponse({ type: ApplicationResponseDto })
  async clearItemDates(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ): Promise<ApplicationResponseDto> {
    const updated = await this.applicationsService.clearItemDates(id, itemId);
    return mapApplication(updated);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get()
  @ApiOperation({ summary: 'Админский список заявок с фильтрами' })
  @ApiBearerAuth()
  @ApiOkResponse({ type: ApplicationsListResponseDto })
  async adminList(
    @Query() query: ListApplicationsQueryDto,
  ): Promise<ApplicationsListResponseDto> {
    const res = await this.applicationsService.adminList(query);
    return {
      data: res.data.map(mapApplication),
      meta: res.meta,
    };
  }
}
