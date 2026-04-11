import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class SignupDto {
  @ApiProperty({ example: 'alice@tasksync.dev', format: 'email' })
  @IsEmail({}, { message: 'Email must be a valid address.' })
  email!: string;

  @ApiProperty({
    example: 'sup3rsecret',
    minLength: 8,
    maxLength: 128,
    description: 'At least 8 characters; must contain a letter and a digit.',
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters.' })
  @MaxLength(128)
  // Minimal but non-trivial password policy. We deliberately keep it simple
  // to avoid the false-security ritual of mandatory special characters.
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'Password must contain at least one letter and one number.',
  })
  password!: string;

  @ApiProperty({ example: 'Alice Anderson', minLength: 2, maxLength: 60 })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name!: string;
}
