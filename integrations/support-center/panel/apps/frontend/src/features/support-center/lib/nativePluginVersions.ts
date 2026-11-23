export function newerNativeVersion(
  next: string | null | undefined,
  current: string,
) {
  if (
    !next ||
    !/^\d{1,9}\.\d{1,9}\.\d{1,9}$/.test(next) ||
    !/^\d{1,9}\.\d{1,9}\.\d{1,9}$/.test(current)
  )
    return false;
  const candidate = next.split(".").map(Number),
    installed = current.split(".").map(Number);
  for (let index = 0; index < 3; index++)
    if (candidate[index] !== installed[index])
      return candidate[index] > installed[index];
  return false;
}
