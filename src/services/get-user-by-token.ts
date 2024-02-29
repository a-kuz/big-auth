import jwt from "@tsndr/cloudflare-worker-jwt";
import { User } from "../User";
import { getUserById } from "./get-user";


export const getUserByToken = async (
  d1: D1Database,
  token: string,
  secret: string,
): Promise<User> => {
  // Verify the provided token
  const decoded = (await jwt.verify(token, secret)) ? await jwt.decode(token) : {}
  if (!decoded?.payload?.sub) {
    throw new Error("invalid token");
  }
  const userId = decoded.payload.sub;
	return getUserById(d1, userId)
};
