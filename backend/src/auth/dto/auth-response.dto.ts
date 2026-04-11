import { ApiProperty } from '@nestjs/swagger';

/**
 * Public-facing user shape — never includes secrets.
 * Used as the `user` field of every auth response.
 */
export class PublicUserDto {
  @ApiProperty({ example: '65f0c0b1e2e7c2a9d4f1a0b1' })
  id!: string;

  @ApiProperty({ example: 'alice@tasksync.dev', format: 'email' })
  email!: string;
}

export class AuthResponseDto {
  @ApiProperty({ type: PublicUserDto })
  user!: PublicUserDto;

  @ApiProperty({ description: 'Short-lived JWT (default 15m).' })
  accessToken!: string;

  @ApiProperty({ description: 'Long-lived JWT (default 7d). Used to obtain new access tokens.' })
  refreshToken!: string;
}
