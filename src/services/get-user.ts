import { User, UserDB } from "../User";
import { newId } from "../utils/new-id";

export const getUser = async (
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
			return User.fromDb(existingUser)

    }
  } catch (error) {
    // Handle error
    console.error(error);
    throw new Error("Failed to retrieve or insert user by phone number");
  }
};
