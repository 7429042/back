import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { AddItemDto } from './dto/add-item.dto';
import { SetQuantityDto } from './dto/set-quantity.dto';
import { UserId } from '../auth/user-id.decorator';

@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  async get(@Req() req: Request & { user?: { sub: string } }) {
    return this.cartService.get(req.user!.sub);
  }

  @Post('items')
  async addItem(@UserId() userId: string, @Body() dto: AddItemDto) {
    const qty = dto.quantity ?? 1;
    return this.cartService.addItem(userId, dto.programId, qty);
  }

  @Patch('items/:programId')
  async setQuantity(
    @UserId() userId: string,
    @Param('programId') programId: string,
    @Body() dto: SetQuantityDto,
  ) {
    return this.cartService.setQuantity(userId, programId, dto.quantity);
  }

  @Delete('items/:programId')
  async removeItem(
    @UserId() userId: string,
    @Param('programId') programId: string,
  ) {
    return this.cartService.removeItem(userId, programId);
  }

  @Delete()
  async clear(@UserId() userId: string) {
    return this.cartService.clear(userId);
  }
}
