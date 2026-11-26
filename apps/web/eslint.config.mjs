import next from "@next/eslint-plugin-next";
import base from "../../eslint.config.mjs";

export default [
  ...base,
  { ignores: [".next/**", "next-env.d.ts"] },
  next.configs["core-web-vitals"],
];
