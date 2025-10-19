import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ChangePasswordResult, UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserId } from '../auth/decorators/user-id.decorator';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { AdminGuard } from '../auth/guards/admin.guard';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { UpdateUserBlockDto } from './dto/update-user-block.dto';
import { multerOptions } from '../common/config/multer.config';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdminCreateUserDto } from './dto/admin-create-user.dto';
import { ParseObjectIdPipe } from '../common/pipes/parse-objectid.pipe';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  async create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async findById(@UserId() userId: string) {
    return this.usersService.findById(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/password')
  async changeMyPassword(
    @UserId() userId: string,
    @Body() dto: UpdatePasswordDto,
  ): Promise<ChangePasswordResult> {
    return this.usersService.changePassword(
      userId,
      dto.oldPassword,
      dto.newPassword,
    );
  }

  @Post('avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('avatar', multerOptions))
  @ApiOperation({ summary: 'Загрузить аватар пользователя' })
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        avatar: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async updateAvatar(
    @UserId() userId: string,
    @Req() req: Request & { user?: { email?: string } },
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Файл не загружен');
    }

    const email = req.user?.email || 'unknown';

    const result = await this.usersService.updateAvatar(
      userId,
      file.filename,
      email,
    );
    return {
      message: 'Аватар успешно загружен',
      avatarUrl: result.avatarUrl,
    };
  }

  @Delete('avatar')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Удалить аватар пользователя' })
  @ApiBearerAuth()
  async deleteAvatar(@UserId() userId: string) {
    await this.usersService.deleteAvatar(userId);
    return {
      message: 'Аватар успешно удалён',
    };
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get()
  async usersList(@Query() query: ListUsersQueryDto) {
    return await this.usersService.usersList(query);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get(':id')
  async getUserById(@Param('id', ParseObjectIdPipe) id: string) {
    return this.usersService.findById(id);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch(':id')
  async updateUser(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.updateByAdmin(id, dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch(':id/block')
  async blockToggle(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateUserBlockDto,
  ) {
    return this.usersService.setBlockByAdmin(id, dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Delete(':id')
  async deleteUser(@Param('id', ParseObjectIdPipe) id: string) {
    return this.usersService.deleteByAdmin(id);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('admin')
  async adminCreate(@Body() dto: AdminCreateUserDto) {
    return this.usersService.createByAdmin(dto);
  }
}
