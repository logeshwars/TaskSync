/**
 * User schema — the canonical identity record.
 *
 * Fields with `select: false` are excluded from queries by default. Anything
 * sensitive (passwordHash, refreshTokenHashes) lives behind that flag so it
 * can never be accidentally serialised back to the client.
 */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true, index: true })
  email!: string;

  // bcrypt hash, never exposed to the client.
  @Prop({ required: true, select: false })
  passwordHash!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop()
  avatarUrl?: string;

  /**
   * Hashes of currently-valid refresh-token JTIs. Each entry corresponds to
   * one active session. Rotation: append on issue, remove on use, clear on
   * logoutAll. Keeping these on the user (rather than a Sessions collection)
   * is the cheapest design that supports multi-device login + revocation.
   */
  @Prop({ type: [String], default: [], select: false })
  refreshTokenHashes!: string[];
}

export const UserSchema = SchemaFactory.createForClass(User);
