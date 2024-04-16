import {User} from '~/db/models/User'

export function displayName(user: User): string {
  if (user.firstName || user.lastName) {
    return `${user.lastName} ${user.firstName}`.trim();
  } else {
    return `@${user.username || user.phoneNumber}`;
  }
}

