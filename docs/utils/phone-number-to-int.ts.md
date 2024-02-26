# `phoneNumberToInt` Function

This function is located in the `utils/phone-number-to-int.ts` file.

## Description

The `phoneNumberToInt` function is used to convert a phone number string into an integer. It does this by removing all non-digit characters from the string and then parsing the remaining string into an integer.

## Parameters

The function takes one parameter:

- `phoneNumber` (string): The phone number to be converted into an integer. This should be a string containing a phone number.

## Returns

The function returns an integer representation of the phone number.

## Example

```typescript
const phoneNumber = "(123) 456-7890";
const result = phoneNumberToInt(phoneNumber);
console.log(result);  // Outputs: 1234567890
```

## Source Code

```typescript
export const phoneNumberToInt = (phoneNumber: string) => {
	return parseInt(phoneNumber.replace(/[\D]*/ig, ''));
};
```