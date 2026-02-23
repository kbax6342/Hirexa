export function cssEscape(str: string) {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
