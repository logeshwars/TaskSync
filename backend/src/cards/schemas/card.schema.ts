/**
 * Card schema (Kanban card / task).
 *
 * Cards live in their own collection — embedding them inside lists would
 * make the list document grow unboundedly and would prevent text indexes
 * on the title.
 *
 * Position model: same LexoRank-style string as lists, scoped to the
 * card's `(boardId, listId)` pair. The list's `cardOrder` array is the
 * authoritative ordering; the per-card `position` field is a tiebreaker
 * used by reorder algorithms.
 */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CardDocument = HydratedDocument<Card>;
export type CardPriority = 'low' | 'medium' | 'high' | 'urgent';

@Schema({ _id: false })
export class CardAttachment {
  @Prop({ type: String, required: true })
  url!: string;

  @Prop({ type: String, required: true })
  name!: string;

  @Prop({ type: Number })
  size?: number;

  @Prop({ type: String })
  contentType?: string;

  @Prop({ type: Date, default: () => new Date() })
  uploadedAt!: Date;
}

const CardAttachmentSchema = SchemaFactory.createForClass(CardAttachment);

@Schema({ timestamps: true, collection: 'cards' })
export class Card {
  @Prop({ type: Types.ObjectId, ref: 'Board', required: true, index: true })
  boardId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'List', required: true, index: true })
  listId!: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true, minlength: 1, maxlength: 200 })
  title!: string;

  @Prop({ type: String, trim: true, maxlength: 10000 })
  description?: string;

  @Prop({
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
  })
  priority!: CardPriority;

  @Prop({ type: [String], default: [] })
  tags!: string[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  assignees!: Types.ObjectId[];

  @Prop({ type: Date, default: null })
  dueDate!: Date | null;

  /** 0–100 progress percentage. */
  @Prop({ type: Number, min: 0, max: 100, default: 0 })
  progress!: number;

  @Prop({ type: String, required: true, index: true })
  position!: string;

  @Prop({ type: [CardAttachmentSchema], default: [] })
  attachments!: CardAttachment[];

  /** Denormalised count for fast list rendering. Maintained by the comments module. */
  @Prop({ type: Number, default: 0, min: 0 })
  commentsCount!: number;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy!: Types.ObjectId;

  @Prop({ type: Date, default: null })
  archivedAt!: Date | null;
}

export const CardSchema = SchemaFactory.createForClass(Card);

// Composite indexes powering the most common queries.
CardSchema.index({ boardId: 1, listId: 1, position: 1 });
// Free-text title search for the global "search a card" affordance.
CardSchema.index({ title: 'text', description: 'text' });
// "My cards" view filters by assignee and due date.
CardSchema.index({ assignees: 1, dueDate: 1 });
