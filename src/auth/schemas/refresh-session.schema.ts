import { HydratedDocument, Types } from 'mongoose';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export type RefreshSessionDocument = HydratedDocument<RefreshSession>;

@Schema({ timestamps: true })
export class RefreshSession {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  @Prop({ type: String, required: true, unique: true, index: true })
  jti: string;

  @Prop({ type: String, required: true })
  tokenHash: string;

  @Prop({ type: Date, required: true, index: true, expires: 0 })
  expiresAt: Date;

  @Prop({ type: Date, required: false, index: true })
  revokedAt?: Date;

  @Prop({ type: String, required: false })
  userAgent?: string;

  @Prop({ type: String, required: false })
  ip?: string;
}

export const RefreshSessionSchema =
  SchemaFactory.createForClass(RefreshSession);

RefreshSessionSchema.index({
  user: 1,
  revokedAt: 1,
  expiresAt: 1,
  createdAt: 1,
});
