import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'alice@tasksync.dev', format: 'email' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'sup3rsecret' })
  @IsString()
  @MinLength(1)
  password!: string;
}
