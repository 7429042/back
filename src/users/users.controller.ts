import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  async create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Post('login')
  async login(@Body() dto: LoginUserDto) {
    return this.usersService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async findById(@Req() req: Request & { user?: { sub: string } }) {
    const userId = (req.user as { sub: string })?.sub;
    return this.usersService.findById(userId);
  }
}
