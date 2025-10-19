import { HydratedDocument } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type CategoryDocument = HydratedDocument<Category>;
export type ParentCategoryDocument = HydratedDocument<ParentCategory>;

enum CategoryType {
  po = 'Профессиональное обучение',
  pp = 'Профессиональная переподготовка',
  pk = 'Повышение квалификации',
}

@Schema({ timestamps: true })
export class ParentCategory {
  @Prop({
    required: true,
    trim: true,
    enum: Object.values(CategoryType),
    unique: true,
  })
  name: string;

  @Prop({ required: true, trim: true, lowercase: true, unique: true })
  slug: string;
}

@Schema({ timestamps: true })
export class Category {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true, lowercase: true, unique: true })
  slug: string;

  @Prop({ required: false, enum: ['ParentCategory', 'Category'], index: true })
  parentModel: 'ParentCategory' | 'Category';

  @Prop({ required: true, index: true })
  path: string;

  @Prop({ required: false })
  imageUrl?: string;

  @Prop({ required: true, default: 0 })
  views: number;
}

export const CategorySchema = SchemaFactory.createForClass(Category);

export const ParentCategorySchema =
  SchemaFactory.createForClass(ParentCategory);

CategorySchema.index({ name: 'text' });
