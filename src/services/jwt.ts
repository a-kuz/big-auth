import jwt from "@tsndr/cloudflare-worker-jwt";
import { User } from "../User";

export const token = async (user: User, secret: string) => {
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
