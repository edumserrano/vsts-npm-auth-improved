import packageJson from "../package.json" with { type: "json" };

export const packageVersion: string = packageJson.version;
export const packageName: string = packageJson.name;
