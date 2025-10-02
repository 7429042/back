import { HydratedDocument, Types } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type CategoryDocument = HydratedDocument<Category>;

@Schema({ timestamps: true })
export class Category {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true, lowercase: true, unique: true })
  slug: string;

  @Prop({ type: Types.ObjectId, ref: 'Category', required: false, index: true })
  parent?: Types.ObjectId;

  @Prop({ required: true, index: true })
  path: string;

  @Prop({ required: true, default: 0 })
  depth: number;
}

export const CategorySchema = SchemaFactory.createForClass(Category);
CategorySchema.index({ name: 'text' });
