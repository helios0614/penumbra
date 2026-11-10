export function isCustomServiceAddress(input: string, defaultUrl: string): boolean {
  const address = input.trim();
  return !!address && address.replace(/\/+$/, "") !== defaultUrl;
}

export function validHttpsBaseAddress(input: string): boolean {
  if (!/^https:\/\/[^/]/i.test(input) || /[\s\\?#\x00-\x1f\x7f]/u.test(input)) return false;
  try {
    const url = new URL(input);
    return !!url.hostname && !url.username && !url.password && !input.slice(8).split("/")[0].includes("@");
  } catch {
    return false;
  }
}

export function validServiceAddress(input: string): boolean {
  return validHttpsBaseAddress(input) && new URL(input).port !== "0";
}
