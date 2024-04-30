import { getUserById } from "~/db/services/get-user";
import { displayName } from "~/services/display-name";


export const dialogNameAndAvatar = async (id: string, DB: D1Database): Promise<[string, string?]> => {
	const cache = dialogNameCaches.get(id);
	if (cache) return cache;

	try {
		const user = await getUserById(DB, id);
		const result = [displayName(user), user.avatarUrl];
		// this.#dialogNameCaches.set(id, result)
		return result as [string, string?];
	} catch (e) {
		return ['@' + id, undefined];
	}
};
const dialogNameCaches = new Map<string, [string, string?]>();
