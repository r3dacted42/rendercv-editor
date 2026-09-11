import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isString(obj: any) {
  return typeof obj === "string" || obj instanceof String;
}

export function removeQuotes(s: string) {
  return s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s;
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
