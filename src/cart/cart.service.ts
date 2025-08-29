import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cart, CartDocument } from './schemas/cart.schema';
import { Model, Types } from 'mongoose';
import { Program, ProgramDocument } from '../programs/schemas/programSchema';

@Injectable()
export class CartService {
  constructor(
    @InjectModel(Cart.name) private readonly cartModel: Model<CartDocument>,
    @InjectModel(Program.name)
    private readonly programModel: Model<ProgramDocument>,
  ) {}

  private toObjectId(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid program ID');
    }
    return new Types.ObjectId(id);
  }

  private async ensureProgramExist(programId: Types.ObjectId) {
    const exists = await this.programModel.exists({ _id: programId }).lean();
    if (!exists) {
      throw new NotFoundException('Program not found');
    }
  }

  async get(userId: string) {
    const user = this.toObjectId(userId);
    const cart = await this.cartModel.findOne({ user }).lean().exec();
    return cart ?? { user, items: [] };
  }

  async addItem(userId: string, programIdRaw: string, quantityRaw: number) {
    const user = this.toObjectId(userId);
    const programId = this.toObjectId(programIdRaw);
    await this.ensureProgramExist(programId);

    const quantity = Math.max(1, quantityRaw ?? 1);

    const cart =
      (await this.cartModel.findOne({ user }).exec()) ??
      (await this.cartModel.create({
        user,
        items: [],
      }));

    const idx = cart.items.findIndex(
      (i) => String(i.program) === String(programId),
    );
    if (idx >= 0) {
      cart.items[idx].quantity += quantity;
    } else {
      cart.items.push({
        program: programId,
        quantity,
      });
    }
    await cart.save();
    return cart.toObject();
  }

  async setQuantity(userId: string, programIdRaw: string, quantity: number) {
    const user = this.toObjectId(userId);
    const programId = this.toObjectId(programIdRaw);
    if (quantity < 1) {
      throw new BadRequestException('Quantity must be at least 1');
    }
    await this.ensureProgramExist(programId);

    const cart = await this.cartModel.findOne({ user }).exec();
    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    const idx = cart.items.findIndex(
      (i) => String(i.program) === String(programId),
    );
    if (idx === -1) {
      throw new NotFoundException('Item not found in cart');
    }
    cart.items[idx].quantity = quantity;
    await cart.save();
    return cart.toObject();
  }

  async removeItem(userId: string, programIdRaw: string) {
    const user = this.toObjectId(userId);
    const programId = this.toObjectId(programIdRaw);

    const cart = await this.cartModel.findOne({ user }).exec();
    if (!cart) {
      throw new NotFoundException('Cart not found');
    }

    const before = cart.items.length;
    cart.items = cart.items.filter(
      (i) => String(i.program) !== String(programId),
    );
    if (cart.items.length === before) {
      throw new NotFoundException('Item not found in cart');
    }
    await cart.save();
    return cart.toObject();
  }

  async clear(userId: string) {
    const user = this.toObjectId(userId);
    const cart =
      (await this.cartModel.findOne({ user }).exec()) ??
      (await this.cartModel.create({
        user,
        items: [],
      }));
    cart.items = [];
    await cart.save();
    return cart.toObject();
  }
}
