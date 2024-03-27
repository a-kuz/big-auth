import { Exclude, Expose, Transform, Type, instanceToPlain, plainToClass } from 'class-transformer'
import 'reflect-metadata'
import { ObjectCamelToSnakeCase, fromSnakeToCamel } from '../../utils/name-сases'

const NullToUndefined = Transform(({ value }) => value || undefined)

@Expose()
export class User {
  id: string

  phoneNumber: string

  @NullToUndefined
  username?: string

  @NullToUndefined
  firstName?: string

  @NullToUndefined
  lastName?: string

  @NullToUndefined
  avatarUrl?: string

  @Exclude()
  @Type(() => Number)
  @NullToUndefined
  createdAt?: number

  @Exclude()
  @Type(() => Number)
  @NullToUndefined
  deletedAt?: number

  // Converts a database row object into an instance of the User class.
  static fromDb(userRow: UserDB) {
    return plainToClass(User, fromSnakeToCamel(userRow))
  }

  constructor(id: string, phoneNumber: string) {
    this.id = id
    this.phoneNumber = phoneNumber
  }

  profile() {
    return instanceToPlain(this, {})
  }
}

export type UserDB = ObjectCamelToSnakeCase<User>
