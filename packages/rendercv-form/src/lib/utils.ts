import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function removeTrailingS(str: string) {
  return str.substring(0, str.endsWith("s") ? str.length - 1 : undefined);
}

export function toTitleCase(str: string) {
  return str
    .split(" ")
    .map((w) => w.at(0)?.toUpperCase() + w.slice(1))
    .join(" ");
}

export function matchSchema(obj: any, sectionsSchema: any) {
  const options = (sectionsSchema.anyOf as any[]).find(
    (opt) => opt.type === "object",
  ).additionalProperties.anyOf as Array<any>;
  const objProps = Object.keys(Array.isArray(obj) ? obj[0] : obj);
  const matches = Array<[number, any]>();
  for (let i = 0; i < options.length; i++) {
    const required = (options[i].items.required || []) as Array<string>;
    const matchCount = objProps.reduce(
      (acc, p) => (acc += required.includes(p) ? 1 : 0),
      0,
    );
    if (matchCount === required.length) matches.push([matchCount, options[i]]);
  }
  matches.sort((a, b) => a[0] - b[0]);
  return matches.at(-1)![1];
}

export function cleanData(data: any): any {
  if (Array.isArray(data)) {
    // Clean children, then filter out the empty primitives
    const arr = data
      .map(cleanData)
      .filter((v) => v !== undefined && v !== null && v !== "");
    return arr.length === 0 ? undefined : arr;
  }
  if (data !== null && typeof data === "object") {
    const obj: any = {};
    for (const [k, v] of Object.entries(data)) {
      if (k === "$schemas") continue;

      const cleaned = cleanData(v);
      if (cleaned !== undefined && cleaned !== null && cleaned !== "") {
        obj[k] = cleaned;
      }
    }
    return Object.keys(obj).length === 0 ? undefined : obj;
  }
  return data;
}
