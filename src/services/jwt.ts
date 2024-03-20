import jwt from "@tsndr/cloudflare-worker-jwt";
import { User } from "../db/models/User";
import { newId } from "../utils/new-id";

// Function to generate an access token for a user
export const generateAccessToken = async (
  user: Pick<User, "phoneNumber" | "id">,
  secret: string,
) => {
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

// Function to generate a refresh token
export const generateRefreshToken = async (userId: string): Promise<string> => {
  return `${newId()}.${userId}`;
};
