/**
 * Users service — the only place that talks to the User collection.
 *
 * Every other module (auth, workspaces) goes through this service rather
 * than injecting the Mongoose model directly. Reasons:
 *   - Sensitive fields (`passwordHash`, `refreshTokenHashes`) are gated
 *     behind explicit `withSecrets` flags.
 *   - Centralised "not found" handling: `findByIdOrThrow` keeps controllers
 *     free of repetitive null checks.
 */
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { User, type UserDocument } from './schemas/user.schema';

interface CreateUserInput {
  email: string;
  passwordHash: string;
  name: string;
}

interface FindOptions {
  /** Include `passwordHash` and `refreshTokenHashes` in the result. */
  withSecrets?: boolean;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async create(input: CreateUserInput): Promise<UserDocument> {
    const exists = await this.userModel.exists({ email: input.email });
    if (exists) {
      throw new ConflictException('Email is already registered.');
    }
    return this.userModel.create(input);
  }

  async findByEmail(email: string, opts: FindOptions = {}): Promise<UserDocument | null> {
    const query = this.userModel.findOne({ email });
    if (opts.withSecrets) {
      query.select('+passwordHash +refreshTokenHashes');
    }
    return query.exec();
  }

  async findById(
    id: string | Types.ObjectId,
    opts: FindOptions = {},
  ): Promise<UserDocument | null> {
    const query = this.userModel.findById(id);
    if (opts.withSecrets) {
      query.select('+passwordHash +refreshTokenHashes');
    }
    return query.exec();
  }

  async findByIdOrThrow(id: string | Types.ObjectId): Promise<UserDocument> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    return user;
  }

  // ---------------------------------------------------------------------------
  // Refresh-token hash maintenance — used by AuthService for rotation.
  // ---------------------------------------------------------------------------

  async addRefreshTokenHash(userId: Types.ObjectId, hash: string): Promise<void> {
    await this.userModel.updateOne({ _id: userId }, { $push: { refreshTokenHashes: hash } });
  }

  async removeRefreshTokenHash(userId: Types.ObjectId, hash: string): Promise<void> {
    await this.userModel.updateOne({ _id: userId }, { $pull: { refreshTokenHashes: hash } });
  }

  async clearRefreshTokens(userId: Types.ObjectId): Promise<void> {
    await this.userModel.updateOne({ _id: userId }, { $set: { refreshTokenHashes: [] } });
  }
}
