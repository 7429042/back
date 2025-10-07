import { HydratedDocument, Query, Types } from 'mongoose';
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

  @Prop({ required: true, default: 0, index: true, min: 0 })
  depth: number;
}

@Schema({ timestamps: true })
export class Category {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, trim: true, lowercase: true, unique: true })
  slug: string;

  @Prop({ required: false, enum: ['ParentCategory', 'Category'], index: true })
  parentModel?: 'ParentCategory' | 'Category';

  @Prop({
    type: Types.ObjectId,
    refPath: 'parentModel',
    required: false,
    index: true,
  })
  parent?: Types.ObjectId;

  @Prop({ required: true, index: true })
  path: string;

  @Prop({ required: true, default: 0, index: true, min: 0 })
  depth: number;

  @Prop({ required: false })
  imageUrl?: string;

  @Prop({ required: true, default: 0 })
  views: number;
}

export const CategorySchema = SchemaFactory.createForClass(Category);

export const ParentCategorySchema =
  SchemaFactory.createForClass(ParentCategory);

CategorySchema.index({ name: 'text' });

CategorySchema.pre('save', function (next) {
  const doc = this as unknown as Category & { path?: string; depth?: number };
  // Корень depth=0: 'a' -> 0, 'a/b' -> 1
  if (typeof doc.path === 'string') {
    doc.depth = Math.max(0, doc.path.split('/').length - 1);
  }
  next();
});

CategorySchema.pre(
  'findOneAndUpdate',
  function (this: Query<any, any, any, any>, next) {
    const update = this.getUpdate();

    // Если используется апдейт через агрегирующий пайплайн — пропускаем
    if (!update || Array.isArray(update)) {
      // Но можно оставить валидации включёнными
      this.setOptions({ runValidators: true, setDefaultsOnInsert: true });
      return next();
    }
    const newPath: unknown = update.path ?? update.$set?.path;
    if (typeof newPath === 'string') {
      const newDepth = Math.max(0, newPath.split('/').length - 1);

      // Всегда писать через $set
      if (!update.$set) update.$set = {};
      update.$set.depth = newDepth;

      // На всякий случай убрать верхнеуровневый depth,
      // чтобы не смешивать операторный и прямой апдейт
      if ('depth' in update) delete update.depth;

      this.setUpdate(update);
    }

    // Включаем валидации/дефолты при апсерте (если используете upsert)
    this.setOptions({ runValidators: true, setDefaultsOnInsert: true });
    next();
  },
);
