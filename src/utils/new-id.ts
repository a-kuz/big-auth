import { customAlphabet, urlAlphabet } from 'nanoid'

// Generates a new unique identifier using a custom alphabet
// The default size is 21 characters, but can be customized via the `size` parameter
export const newId = (size = 21) => customAlphabet(urlAlphabet, size)()