import { UserModel, type UserDocument } from '../models/User';

/**
 * Ensures a Mongo gamification user exists for this Flask JWT identity (`username`).
 */
export async function ensureGamificationUser(
  username: string,
  emailHint?: string
): Promise<UserDocument> {
  const uname = username.trim();
  if (!uname) {
    throw new Error('Empty username');
  }

  const existing = await UserModel.findOne({ username: uname });
  if (existing) {
    return existing;
  }

  const email = (emailHint ?? `${uname}+gamification@local`).toLowerCase();
  return UserModel.create({
    username: uname,
    email,
  });
}
