/**
 * Activity schema — the audit log for boards.
 *
 * Every mutating operation (card created, card moved, comment added, …)
 * writes one row here. The feed is the source for both the in-app
 * activity panel and any future notifications digest.
 *
 * Notes:
 *   - `type` is a discriminator string with a fixed vocabulary. Keeping
 *     this stable is important because it's how the frontend picks the
 *     right copy template.
 *   - `payload` is a free-form bag of display data (card title, from/to
 *     list names, mentioned users) — everything the UI needs so it can
 *     render an entry without re-fetching the target entity.
 */
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ActivityDocument = HydratedDocument<Activity>;

export type ActivityType =
  | 'card.created'
  | 'card.updated'
  | 'card.moved'
  | 'card.deleted'
  | 'card.assigned'
  | 'list.created'
  | 'list.updated'
  | 'list.deleted'
  | 'board.updated'
  | 'comment.added'
  | 'comment.deleted';

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'activities' })
export class Activity {
  @Prop({ type: Types.ObjectId, ref: 'Board', required: true, index: true })
  boardId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Card', default: null })
  cardId!: Types.ObjectId | null;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  actorId!: Types.ObjectId;

  @Prop({ type: String, required: true, index: true })
  type!: ActivityType;

  /**
   * Opaque display payload. Kept as `Record<string, unknown>` so schema
   * migrations for individual activity types don't require backfills.
   */
  @Prop({ type: Object, default: {} })
  payload!: Record<string, unknown>;
}

export const ActivitySchema = SchemaFactory.createForClass(Activity);

// Feed pagination hits this composite — board first, then time.
ActivitySchema.index({ boardId: 1, createdAt: -1 });
