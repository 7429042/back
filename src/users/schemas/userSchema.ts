import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum Role {
  ADMIN = 'admin',
  USER = 'user',
}

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, index: true })
  email: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ required: true, default: Role.USER })
  role: Role;

  @Prop({ required: false, trim: true })
  firstName?: string;

  @Prop({ required: false, trim: true })
  lastName?: string;

  @Prop({ required: false, default: false, index: true })
  isBlocked: boolean;

  @Prop({ required: false })
  avatarUrl?: string;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ role: 1, isBlocked: 1, createdAt: -1 });
UserSchema.index({ role: 1, isBlocked: 1, updatedAt: -1 });
UserSchema.index({ role: 1, isBlocked: 1, email: 1 });

UserSchema.index(
  { email: 'text', firstName: 'text', lastName: 'text' },
  {
    name: 'user_search_text',
    weights: { email: 3, firstName: 2, lastName: 2 },
    default_language: 'russian',
  },
);
