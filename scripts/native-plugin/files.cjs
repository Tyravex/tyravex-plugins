const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

function digest(content) {
  return createHash("sha256")
    .update(content.toString().replace(/\r\n/g, "\n"))
    .digest("hex");
}
function inside(root, relative) {
  if (
    !/^[A-Za-z0-9_./-]+$/.test(relative) ||
    relative.includes("\\") ||
    relative
      .split("/")
      .some((value) => !value || value === "." || value === "..") ||
    path.isAbsolute(relative)
  )
    throw new Error(`Unsafe source path: ${relative}`);
  const base = path.resolve(root);
  const target = path.resolve(base, relative);
  if (!target.startsWith(`${base}${path.sep}`))
    throw new Error("Path escapes root");
  for (
    let current = target;
    current !== base;
    current = path.dirname(current)
  ) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink())
      throw new Error(`Links are not allowed: ${relative}`);
  }
  if (fs.lstatSync(base).isSymbolicLink())
    throw new Error("Root must not be a link");
  return target;
}
function list(root, prefix = "") {
  const result = [];
  for (const item of fs.readdirSync(root, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${item.name}` : item.name;
    const target = inside(root, item.name);
    if (item.isDirectory()) result.push(...list(target, relative));
    else if (item.isFile()) result.push(relative);
    else throw new Error(`Unsupported file: ${relative}`);
  }
  return result.sort();
}
module.exports = { digest, inside, list };
