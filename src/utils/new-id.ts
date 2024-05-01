import { customAlphabet, urlAlphabet } from 'nanoid'

export const newId = (size?: number) => customAlphabet(urlAlphabet, size)()
