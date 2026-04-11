import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'A previously-issued refresh token (from /auth/login or /auth/signup).',
  })
  @IsString()
  refreshToken!: string;
}
