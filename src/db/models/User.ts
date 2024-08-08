import { Exclude, Expose, Transform, Type, instanceToPlain, plainToClass } from 'class-transformer'
import 'reflect-metadata'
import { ObjectCamelToSnakeCase, fromSnakeToCamel } from '../../utils/name-сases'
import { Bool } from '@cloudflare/itty-router-openapi'

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

  @NullToUndefined
	@Type(()=>Boolean)
  verified?: boolean

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

  static fromProfile(profile: Profile) {
    return plainToClass(User, profile)
  }

  constructor(id: string, phoneNumber: string) {
    this.id = id
    this.phoneNumber = phoneNumber
  }

  profile() {
    return instanceToPlain(this, {}) as Profile
  }
}

export type UserDB = Omit<ObjectCamelToSnakeCase<User>, 'profile'>
export type Profile = Pick<
  User,
  'firstName' | 'lastName' | 'id' | 'username' | 'phoneNumber' | 'avatarUrl' | 'verified'
>
export type ProfileWithLastSeen = Profile & { lastSeen?: number }
