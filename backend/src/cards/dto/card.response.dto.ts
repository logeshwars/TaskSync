import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { CardPriority } from '../schemas/card.schema';

export class CardAttachmentResponseDto {
  @ApiProperty()
  url!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  size?: number;

  @ApiPropertyOptional()
  contentType?: string;

  @ApiProperty()
  uploadedAt!: Date;
}

export class CardResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  boardId!: string;

  @ApiProperty()
  listId!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({ enum: ['low', 'medium', 'high', 'urgent'] })
  priority!: CardPriority;

  @ApiProperty({ type: [String] })
  tags!: string[];

  @ApiProperty({ type: [String] })
  assignees!: string[];

  @ApiProperty({ nullable: true })
  dueDate!: Date | null;

  @ApiProperty()
  progress!: number;

  @ApiProperty()
  position!: string;

  @ApiProperty({ type: [CardAttachmentResponseDto] })
  attachments!: CardAttachmentResponseDto[];

  @ApiProperty()
  commentsCount!: number;

  @ApiProperty()
  createdBy!: string;

  @ApiProperty()
  archived!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
