import {
  CallbackWithoutResultAndOptionalError,
  HydratedDocument,
  Types,
} from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type ProgramDocument = HydratedDocument<Program>;

export type ProgramStatus = 'draft' | 'published';

@Schema({ timestamps: true })
export class Program {
  @Prop({ required: false, trim: true })
  title?: string;

  @Prop({ required: false, trim: true })
  description?: string;

  @Prop({ type: Types.ObjectId, ref: 'Category', required: true, index: true })
  category: Types.ObjectId;

  @Prop({ required: true, default: 0, min: 0 })
  views: number;

  @Prop({ required: false, min: 0 })
  hours?: number;

  @Prop({ required: false, trim: true })
  completionDocument?: string;

  @Prop({
    trim: true,
    lowercase: true,
    unique: true,
    index: true,
    required: false,
  })
  slug?: string;

  @Prop({
    required: true,
    enum: ['draft', 'published'],
    default: 'draft',
    index: true,
  })
  status: ProgramStatus;

  @Prop({ required: false, index: true })
  lowercaseTitle?: string;

  @Prop({ required: false, min: 0 })
  price?: number;
}

export const ProgramSchema = SchemaFactory.createForClass(Program);

ProgramSchema.pre(
  'save',
  async function (
    this: HydratedDocument<Program>,
    next: CallbackWithoutResultAndOptionalError,
  ) {
    try {
      const titleTrim = this.title?.trim();
      this.lowercaseTitle =
        titleTrim && titleTrim.length > 0 ? titleTrim.toLowerCase() : undefined;

      if (!this.category) return next(new Error('Category is required'));

      const CategoryModel = this.model('Category');
      const cat = await CategoryModel.findById(this.category, { path: 1 })
        .lean<{ path: string }>()
        .exec();

      if (!cat || typeof cat.path !== 'string')
        return next(new Error('Category not found'));

      const rootSlug: string = String(cat.path).split('/')[0] || '';
      switch (rootSlug) {
        case 'professionalnoe-obuchenie':
          this.completionDocument =
            'Свидетельство о профессии рабочего / должности служащего';
          break;
        case 'professionalnaya-perepodgotovka':
          this.completionDocument = 'Диплом о профессиональной переподготовке';
          break;
        case 'povyshenie-kvalifikacii':
          this.completionDocument = 'Удостоверение о повышении квалификации';
          break;
        default:
          this.completionDocument = undefined;
          break;
      }
      next();
    } catch (error) {
      next(error as Error);
    }
  },
);

ProgramSchema.index(
  { title: 'text', description: 'text' },
  {
    weights: {
      title: 10,
      description: 5,
    },
    name: 'ProgramTextIndex',
    default_language: 'russian',
    language_override: 'language',
  },
);

ProgramSchema.index(
  {
    status: 1,
    category: 1,
    lowercaseTitle: 1,
    views: -1,
    createdAt: -1,
  },
  {
    name: 'ProgramSuggestIndex',
  },
);
