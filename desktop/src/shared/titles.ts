export function displayTitle(title: string): string {
  return title.replace(/\p{L}/u, letter => letter.toLocaleUpperCase());
}
