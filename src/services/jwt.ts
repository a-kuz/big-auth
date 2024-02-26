import jwt from "@tsndr/cloudflare-worker-jwt";
import { User } from "../User";
import { newId } from "../utils/new-id";

export const generateAccessToken = async (user: Pick<User, 'phoneNumber' | 'id'>, secret: string) => {
  // Creating a token
  const token = await jwt.sign(
    {
      sub: user.id,
      phone: user.phoneNumber,
      nbf: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 30 * (24 * (60 * 60)), // Expires: Now + 30 days
    },
    secret,
  );
  return token;
};

export const generateRefreshToken = async (): Promise<string> => {
  return newId();
};
