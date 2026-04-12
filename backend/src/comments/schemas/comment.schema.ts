/**
 * Comment schema.
 *
 * Comments live in their own collection, keyed by cardId. We store
 * `boardId` too so permission checks can run against the card's board
 * without an extra join every time.
 *
 * Mentions are stored as an array of user ids that the comment body
 * referenced via `@username`. The service layer parses the body on write
 * and populates this array — storing it separately means the realtime
 * gateway can broadcast "you were mentioned" notifications cheaply.
 */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CommentDocument = HydratedDocument<Comment>;

@Schema({ timestamps: true, collection: 'comments' })
export class Comment {
  @Prop({ type: Types.ObjectId, ref: 'Card', required: true, index: true })
  cardId!: Types.ObjectId;

  /** Denormalised from the parent card for faster permission checks. */
  @Prop({ type: Types.ObjectId, ref: 'Board', required: true, index: true })
  boardId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  authorId!: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true, minlength: 1, maxlength: 5000 })
  body!: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  mentions!: Types.ObjectId[];

  @Prop({ type: Date, default: null })
  editedAt!: Date | null;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);

// Pagination on the card detail "comments" tab sorts by createdAt descending.
CommentSchema.index({ cardId: 1, createdAt: -1 });
