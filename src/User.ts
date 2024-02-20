export class User {
  id: string;
  phoneNumber: number;
  username?: string;
  firstName?: string;
  avatarUrl?: string;
  createdAt?: number;

	constructor (u: UserDB) {
		this.id = u.id;
    this.phoneNumber = u.phone_number;
    this.username = u.username || undefined
    this.firstName = u.first_name || undefined;
    this.avatarUrl = u.avatar_url || undefined;
    this.createdAt = u.created_at || undefined;
	}

	profile() {
		return {
			id: this.id,
			phoneNumber: `+${this.phoneNumber}`,
			username: this.username,
			firstName: this.firstName,
			avatarUrl: this.avatarUrl
		}
	}
}

export type Profile = ReturnType<User['profile']>

export interface UserDB {
	id: string,
	phone_number: number,
	created_at?: number,
	username?: string,
	first_name?: string,
	avatar_url?: string,
	deleted_at?: number,

}
