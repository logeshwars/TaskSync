import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ListResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  boardId!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  position!: string;

  @ApiPropertyOptional({ nullable: true })
  wipLimit!: number | null;

  @ApiProperty({ type: [String], description: 'Ordered card ids in this list.' })
  cardOrder!: string[];

  @ApiProperty()
  archived!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
