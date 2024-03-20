export const normalizePhoneNumber = (phoneNumber: string) => {
  return phoneNumber
    .replace(/[^\d\+]/g, "")
    .replace(".*(+?)(d{3})[^d]{0,7}(d{3})[^d]{0,7}(d{4}).*", "$1$2$3$4");
};
