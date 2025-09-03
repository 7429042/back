import { HydratedDocument, Types } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type ProgramDocument = HydratedDocument<Program>;

export type ProgramStatus = 'draft' | 'published';

@Schema({ timestamps: true })
export class Program {
  @Prop({ required: false, trim: true })
  title?: string;

  @Prop({ required: false, enum: ['dpo', 'prof_training'], index: true })
  categoryType?: 'dpo' | 'prof_training';

  @Prop({ required: false, enum: ['pk', 'pp'], index: true })
  dpoSubcategory?: 'pk' | 'pp';

  @Prop({ required: false, trim: true })
  description?: string;

  @Prop({ type: Types.ObjectId, ref: 'Category', required: false, index: true })
  category?: Types.ObjectId;

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
}

export const ProgramSchema = SchemaFactory.createForClass(Program);

ProgramSchema.pre('save', function (next) {
  const doc = this as unknown as Program;
  if (doc.categoryType === 'dpo') {
    if (doc.dpoSubcategory === 'pk') {
      doc.completionDocument = 'Удостоверение о повышении квалификации';
    } else if (doc.dpoSubcategory === 'pp') {
      doc.completionDocument = 'Диплом о профессиональной переподготовке';
    } else {
      doc.completionDocument = undefined;
    }
  } else if (doc.categoryType === 'prof_training') {
    doc.completionDocument =
      'Свидетельство о профессии рабочего / должности служащего';
  } else {
    doc.completionDocument = undefined;
  }
  doc.lowercaseTitle =
    typeof doc.title === 'string' && doc.title.trim().length > 0
      ? doc.title.trim().toLowerCase()
      : undefined;
  next();
});

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
    catogory: 1,
    lowercaseTitle: 1,
    views: -1,
    createdAt: -1,
  },
  {
    name: 'ProgramSuggestIndex',
  },
);
