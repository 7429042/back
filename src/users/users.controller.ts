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
    @Req() req: Request & { user: { id: string; email: string } },
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Файл не загружен');
    }
    const user = await this.usersService.updateAvatar(
      req.user.id,
      file.filename,
      req.user.email,
    );
    return {
      message: 'Аватар успешно загружен',
      avatarUrl: user.avatarUrl,
    };
  }

  @Delete('avatar')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Удалить аватар пользователя' })
  @ApiBearerAuth()
  async deleteAvatar(@Req() req: Request & { user: { id: string } }) {
    await this.usersService.deleteAvatar(req.user.id);
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
  async getUserById(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch(':id')
  async updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.updateByAdmin(id, dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch(':id/block')
  async blockToggle(@Param('id') id: string, @Body() dto: UpdateUserBlockDto) {
    return this.usersService.setBlockByAdmin(id, dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Delete(':id')
  async deleteUser(@Param('id') id: string) {
    return this.usersService.deleteByAdmin(id);
  }
}
