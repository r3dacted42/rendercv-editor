import { isString, removeQuotes } from "./utils";

const TAB = "  ";

export function JSONtoYAML(json: any, tabs = "") {
  if (isString(json)) return JSON.stringify(json) + "\n";
  if (!json) return "";
  let res = "";
  for (const [key, obj] of Object.entries(json)) {
    if (key.startsWith("$")) continue;
    if (isString(obj)) {
      res += `${tabs}${key}: ${JSON.stringify(obj)}\n`;
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

export function YAMLtoJSON(yaml: string) {
  const lines = yaml
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.length !== 0);

  const getChildYAML = (idx: number) => {
    const isListItem = lines[idx].startsWith("-");
    if (!isListItem && idx + 1 >= lines.length) return "";
    let endIdx = lines.slice(idx + 1).findIndex((l) => !l.startsWith(" "));
    if (endIdx === -1) endIdx = lines.length;
    else endIdx += idx + 1;
    return lines
      .slice(idx + (isListItem ? 0 : 1), endIdx)
      .map((l) => l.slice(TAB.length))
      .join("\n")
      .trimStart();
  };

  let res = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith(" ") || line.startsWith("#")) continue;
    if (!line.endsWith(":")) {
      if (line.startsWith("-")) {
        if (!res) res = [] as Array<any>;
        if (Array.isArray(res)) res.push(YAMLtoJSON(getChildYAML(i)));
        else console.warn("could not push:", line);
      } else if (line.includes(":")) {
        if (!res) res = {} as any;
        const [key, ...value] = line.trim().split(":")!;
        res[key.trim()] = removeQuotes(value.join(":").trim());
      } else {
        if (!res) res = "";
        if (isString(res)) res += removeQuotes(line);
        else console.warn("could not append:", line);
      }
    } else {
      const key = line.slice(0, -1);
      if (!res) res = {} as any;
      res[key] = YAMLtoJSON(getChildYAML(i));
    }
  }
  return res;
}
