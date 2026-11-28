import next from "@next/eslint-plugin-next";
import base from "../../eslint.config.mjs";

export default [
  ...base,
  { ignores: [".next/**", "next-env.d.ts", "public/monaco/**"] },
  next.configs["core-web-vitals"],
];
