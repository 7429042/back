import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { AuthGuard } from '@nestjs/passport';
import { JwtPayload } from '../auth/jwt.strategy';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';
import { AdminGuard } from '../auth/admin.guard';
import { UpdateApplicationItemStartDateDto } from './dto/update-application-item-start-date.dto';
import { GetUserApplicationQueryDto } from './dto/get-user-application-query.dto';

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

  @UseGuards(AuthGuard('jwt'))
  @Post()
  async create(
    @Body() dto: CreateApplicationDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    const userId = req.user.sub;
    return this.applicationsService.create({ ...dto, userId });
  }

  @Get('user/:userId')
  async findByUser(
    @Param('userId') userId: string,
    @Query() query: GetUserApplicationQueryDto,
  ) {
    return this.applicationsService.findByUser(userId, query);
  }

  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateApplicationStatusDto,
  ) {
    return this.applicationsService.updateStatus(id, dto.status);
  }

  @UseGuards(AuthGuard('jwt'), AdminGuard)
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

  @UseGuards(AuthGuard('jwt'), AdminGuard)
  @Patch(':id/items/:itemId/clear-dates')
  async clearItemDates(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.applicationsService.clearItemDates(id, itemId);
  }
}
