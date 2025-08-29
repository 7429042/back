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

@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  async get(@Req() req: Request & { user?: { sub: string } }) {
    return this.cartService.get(req.user!.sub);
  }

  @Post('items')
  async addItem(
    @Req() req: Request & { user?: { sub: string } },
    @Body() dto: AddItemDto,
  ) {
    const qty = dto.quantity ?? 1;
    return this.cartService.addItem(req.user!.sub, dto.programId, qty);
  }

  @Patch('items/:programId')
  async setQuantity(
    @Req() req: Request & { user?: { sub: string } },
    @Param('programId') programId: string,
    @Body() dto: SetQuantityDto,
  ) {
    return this.cartService.setQuantity(req.user!.sub, programId, dto.quantity);
  }

  @Delete('items/:programId')
  async removeItem(
    @Req() req: Request & { user?: { sub: string } },
    @Param('programId') programId: string,
  ) {
    return this.cartService.removeItem(req.user!.sub, programId);
  }

  @Delete()
  async clear(@Req() req: Request & { user?: { sub: string } }) {
    return this.cartService.clear(req.user!.sub);
  }
}
