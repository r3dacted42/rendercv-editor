import { isString } from "./utils";

const TAB = "  ";

export function JSONtoYAML(json: any, tabs = "") {
  if (isString(json)) {
    return JSON.stringify(json) + "\n";
  }
  let res = "";
  for (const [key, obj] of Object.entries(json)) {
    if (key.startsWith("$")) continue;
    if (isString(obj)) {
      res += `${tabs}${key}: ${obj}\n`;
    } else if (Array.isArray(obj)) {
      if (obj.length === 0) continue;
      res += `${tabs}${key}:\n`;
      for (const o of obj)
        res += `${tabs}${TAB}- ${JSONtoYAML(o, `${TAB}${TAB}${tabs}`).trimStart()}`;
    } else {
      res += `${tabs}${key}:\n${JSONtoYAML(obj, tabs + TAB)}`;
    }
  }
  return res;
}
