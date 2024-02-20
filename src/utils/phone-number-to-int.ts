export const phoneNumberToInt = (phoneNumber: string) => {
	return parseInt(phoneNumber.replace(/[\D]*/ig, ''));
};
