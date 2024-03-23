import {
  Exclude,
  Expose,
  Transform,
  Type,
  plainToClass,
} from "class-transformer";
import "reflect-metadata";
import {
  ObjectCamelToSnakeCase,
  fromSnakeToCamel,
} from "../../utils/name-сases";

// The User class represents a user entity with various properties and behaviors.
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
  @Type(() => Number)
  @Transform(({ value }) => value || undefined)
  createdAt?: number;
  @Type(() => Number)
  @Transform(({ value }) => value || undefined)
  deletedAt?: number;

  // Converts a database row object into an instance of the User class.
  static fromDb(userRow: UserDB) {
    return plainToClass(User, fromSnakeToCamel(userRow));
  }

  constructor(id: string, phoneNumber: string) {
    this.id = id;
    this.phoneNumber = phoneNumber;
  }
}

export type UserDB = ObjectCamelToSnakeCase<User>;
