import jwt from "@tsndr/cloudflare-worker-jwt";
import { User, UserDB } from "../User";

export const getUserByToken = async (
  d1: D1Database,
  token: string,
  secret: string,
): Promise<User> => {
  const decoded = (await jwt.verify(token, secret)) ? await jwt.decode(token) : {}
  if (!decoded?.payload?.sub) {
    throw new Error("invalid token");
  }
  const userId = decoded.payload.sub;
  const query = "SELECT * FROM users WHERE id = ? and deleted_at is null";
  try {
    const existingUser = await d1.prepare(query).bind(userId).first<UserDB>();

    if (!existingUser) {
      throw new Error("user not found");
    }
    return new User(existingUser);
  } catch (error) {
    // Handle error
    console.error(error);
    throw new Error("Failed to retrieve or insert user by phone number");
  }
};
