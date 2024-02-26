# `utils/new-id.ts`

This module exports a function `newId` which generates a new unique identifier.

## Dependencies

This module depends on the `nanoid` package.

```typescript
import { customAlphabet, urlAlphabet } from "nanoid";
```

## `newId`

`newId` is a function that generates a new unique identifier. It uses the `customAlphabet` function from the `nanoid` package with the `urlAlphabet` as the alphabet set.

```typescript
export const newId = customAlphabet(urlAlphabet);
```

This function does not take any arguments and returns a string. The returned string is a unique identifier that can be used throughout the application.