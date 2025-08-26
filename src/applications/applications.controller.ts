import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { AuthGuard } from '@nestjs/passport';
import { JwtPayload } from '../auth/jwt.strategy';

@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

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
  async findByUser(@Param('userId') userId: string) {
    return this.applicationsService.findByUser(userId);
  }
}
