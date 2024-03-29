import { User, UserDB } from "../models/User";
import { newId } from "../../utils/new-id";

export const getOrCreateUserByPhone = async (
  d1: D1Database,
  phoneNumber: string,
): Promise<User> => {
  const query =
    "SELECT * FROM users WHERE phone_number = ? and deleted_at is null";
  try {
    const existingUser = await d1
      .prepare(query)
      .bind(phoneNumber)
      .first<UserDB>();

    if (!existingUser) {
      const insertQuery =
        "INSERT INTO users (id, phone_number, created_at) VALUES (?, ?, ?)";
      const id = newId();
      const createdAt = Date.now();
      await d1.prepare(insertQuery).bind(id, phoneNumber, createdAt).run();
      return new User(id, phoneNumber);
    } else {
      return User.fromDb(existingUser);
    }
  } catch (error) {
    // Handle error
    console.error(error);
    throw new Error("Failed to retrieve or insert user by phone number");
  }
};
export const getUserById = async (
  d1: D1Database,
  id: string,
): Promise<User> => {
  const query = "SELECT * FROM users WHERE id = ? and deleted_at is null";
  try {
    const existingUser = await d1.prepare(query).bind(id).first<UserDB>();

    if (!existingUser) {
      throw new Error(`User not found ${{ id }}`);
    } else {
      return User.fromDb(existingUser);
    }
  } catch (error) {
    // Handle error
    console.error(error);
    throw new Error("Failed to retrieve user by id");
  }
};

export const getUserByPhoneNumbers = async (
  d1: D1Database,
  phoneNumbers: string[],
): Promise<User[]> => {
  const placeholders = phoneNumbers.map(() => "?").join(",");
  const query = `SELECT * FROM users WHERE phone_number IN (${placeholders}) and deleted_at is null`;

  try {
    const users = await d1
      .prepare(query)
      .bind(...phoneNumbers)
      .all<UserDB>();
    return users.results.map(User.fromDb);
  } catch (error) {
    console.error("Failed to retrieve users by phone numbers:", error);
    throw new Error("Failed to retrieve users by phone numbers");
  }
};
