
import { User, UserDB } from "../models/User";
import { fromCamelToSnake } from "../../utils/name-сases";

export const updateUser = async (
  d1: D1Database,
  userId: string,
  updates: Partial<User>
): Promise<User> => {
	const snakedUpdates = fromCamelToSnake(updates);
  // Construct the SQL update statement dynamically based on the provided updates
  const setClause = Object.keys(snakedUpdates)
    .map((key) => `${key} = ?`)
    .join(", ");
  const sql = `UPDATE users SET ${setClause} WHERE id = ?`;

  // Prepare the values for the SQL statement (including the userId at the end)
  const values = [...Object.values(snakedUpdates), userId];

  try {
    // Execute the update statement
    await d1.prepare(sql).bind(...values).run();

    // Retrieve the updated user from the database to return
    const updatedUser = await d1
      .prepare("SELECT * FROM users WHERE id = ?")
      .bind(userId)
      .first<UserDB>();

    if (!updatedUser) {
      throw new Error("User not found after update");
    }

    return User.fromDb(updatedUser);
  } catch (error) {
    console.error("Failed to update user:", error);
    throw new Error("Failed to update user");
  }
};
