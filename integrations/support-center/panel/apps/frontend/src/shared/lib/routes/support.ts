export function supportListPath(staff = false) {
  return staff ? "/admin/support" : "/support";
}

export function supportTicketPath(id: string, staff = false) {
  return `${supportListPath(staff)}/tickets/${encodeURIComponent(id)}`;
}

export function supportBackPath(value: unknown, staff = false) {
  const base = supportListPath(staff);
  return typeof value === "string" && value.split("?")[0] === base
    ? value
    : base;
}
