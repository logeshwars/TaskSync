import { ApiProperty } from '@nestjs/swagger';

export class CommentResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  cardId!: string;

  @ApiProperty()
  boardId!: string;

  @ApiProperty()
  authorId!: string;

  @ApiProperty()
  body!: string;

  @ApiProperty({ type: [String] })
  mentions!: string[];

  @ApiProperty({ nullable: true })
  editedAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;
}
