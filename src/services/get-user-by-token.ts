import jwt from "@tsndr/cloudflare-worker-jwt";
import { User } from "../db/models/User";
import { getUserById } from "../db/services/get-user";

/**
 * Authenticates a user by verifying a JWT and retrieving the user's details from the database.
 * 
 * @param d1 - An instance of the D1 database to perform queries.
 * @param token - The JWT provided by the user for authentication.
 * @param secret - The secret key used to verify the JWT.
 * @returns A promise that resolves with the authenticated user's details.
 * @throws Error if the token is invalid or verification fails.
 */
export const getUserByToken = async (
  d1: D1Database,
  token: string,
  secret: string,
): Promise<User> => {
  // Verify and decode the provided JWT token
  const isValid = await jwt.verify(token, secret);
  if (!isValid) {
    throw new Error("Invalid token");
  }
  const decoded = await jwt.decode(token);
  if (!decoded?.payload?.sub) {
    throw new Error("Token payload is missing 'sub' property");
  }

  // Extract user ID from the token payload
  const userId = decoded.payload.sub;

  // Retrieve user details from the database by user ID
  return getUserById(d1, userId);
};