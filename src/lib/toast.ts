export const toast = {
  success: (message: string) => { if (typeof console !== "undefined") console.log(message); },
  error: (message: string) => { if (typeof console !== "undefined") console.error(message); },
  info: (message: string) => { if (typeof console !== "undefined") console.info(message); },
};
