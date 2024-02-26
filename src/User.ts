import {
  Exclude,
  Expose,
  Transform,
  Type,
  plainToClass,
} from "class-transformer";
import "reflect-metadata";
import { ObjectCamelToSnakeCase, fromSnakeToCamel } from "./utils/name-сases";

@Exclude()
export class User {
  @Expose({})
  id: string;
  @Expose({})
  phoneNumber: string;
  @Expose()
  @Transform(({ value }) => value || undefined)
  username?: string;
  @Expose()
  @Transform(({ value }) => value || undefined)
  firstName?: string;
  @Expose()
  @Transform(({ value }) => value || undefined)
  lastName?: string;
  @Expose()
  @Transform(({ value }) => value || undefined)
  avatarUrl?: string;
  @Type()
  createdAt?: number;
  deletedAt?: number;

  static fromDb(userRow: UserDB) {
    return plainToClass(User, fromSnakeToCamel(userRow));
  }

  constructor(id: string, phoneNumber: string) {
    this.id = id;
    this.phoneNumber = phoneNumber;
  }
}

export type UserDB = ObjectCamelToSnakeCase<User>;

// export interface UserDB = ObjectCamelToSnakeCase<User> {
// 	id: string,
// 	phone_number: number,
// 	created_at?: number,
// 	username?: string,
// 	first_name?: string,
// 	last_name?: string,
// 	avatar_url?: string,
// 	deleted_at?: number,

// }

// export interface User {
// 	id: string,
//   phoneNumber: number;
//   username?: string;
//   firstName?: string;
//   lastName?: string;
//   avatarUrl?: string;
// }
