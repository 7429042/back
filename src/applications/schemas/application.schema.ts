import { HydratedDocument, Types } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type ApplicationItemDocument = HydratedDocument<ApplicationItem>;
export type ApplicationDocument = HydratedDocument<Application>;

export enum EducationType {
  BASIC_EDUCATION = 'Основное общее образование',
  SECONDARY_GEN_EDUCATION = 'Среднее общее образование',
  SECONDARY_VOCATIONAL_EDUCATION = 'Среднее профессиональное образование',
  HIGHER_EDUCATION = 'Высшее образование',
}

export enum StatusType {
  NEW = 'new',
  IN_REVIEW = 'in_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Schema()
class StatusHistoryItem {
  @Prop({ required: true, enum: Object.values(StatusType), type: String })
  from: StatusType;

  @Prop({ required: true, enum: Object.values(StatusType), type: String })
  to: StatusType;

  @Prop({ required: true, type: Date, default: Date.now })
  changedAt: Date;

  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  byUser: Types.ObjectId;

  @Prop({ required: false, type: String, trim: true })
  comment?: string;
}

const StatusHistoryItemSchema = SchemaFactory.createForClass(StatusHistoryItem);

@Schema()
export class ApplicationItem {
  _id?: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Program', index: true })
  program: Types.ObjectId;

  @Prop({ type: Number, min: 1, default: 1 })
  quantity: number;

  @Prop({ type: Number, min: 0 })
  priceAtApplication?: number;

  @Prop({ type: String })
  titleAtApplication?: string;

  @Prop({ type: Date, required: false })
  startDate?: Date;

  @Prop({ type: Date, required: false })
  endDate?: Date;
}

export const ApplicationItemSchema =
  SchemaFactory.createForClass(ApplicationItem);

@Schema({ timestamps: true })
export class Application {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User', index: true })
  user: Types.ObjectId;

  @Prop({ type: [ApplicationItemSchema], required: true })
  items: ApplicationItem[];

  @Prop({ type: String, required: true })
  snils: string;

  @Prop({ type: String, required: true })
  inn: string;

  @Prop({ type: String, required: true, trim: true })
  institutionName: string;

  @Prop({ type: Date, required: true })
  graduationDate: Date;

  @Prop({ type: String, required: true, enum: Object.values(EducationType) })
  educationType: EducationType;

  @Prop({
    type: String,
    enum: Object.values(StatusType),
    default: StatusType.NEW,
  })
  status?: StatusType;

  @Prop({ type: [StatusHistoryItemSchema], default: [] })
  statusHistory?: StatusHistoryItem[];
}

export const ApplicationSchema = SchemaFactory.createForClass(Application);
