export type PhoneBookItem = {
  phoneNumber: string
  firstName?: string
  lastName?: string
  avatarUrl?: string
  fingerprint?:string
}
export type PhoneBook = PhoneBookItem[]
