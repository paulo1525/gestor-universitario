import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

async function compile(file, dependencies = {}) {
  const code = ts.transpileModule(
    await readFile(new URL(file, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText;
  const compiled = { exports: {} };
  new Function("module", "exports", "require", code)(
    compiled,
    compiled.exports,
    (key) => {
      assert.ok(key in dependencies, "Unexpected dependency: " + key);
      return dependencies[key];
    },
  );
  return compiled.exports;
}
const richText = await compile("../lib/announcement-content.ts");
const { RichTextContent } = await compile(
  "../components/rich-text-editor.tsx",
  {
    react: React,
    "react/jsx-runtime": jsx,
    "lucide-react": {},
    "@/components/i18n-context": {},
    "@/lib/announcement-content": richText,
    "@/components/rich-text-editor.module.css": {
      default: { content: "rich-text" },
    },
  },
);

test("notificações apresentam parágrafos e links seguros sem permitir scripts ou atributos executáveis", () => {
  const html = renderToStaticMarkup(
    React.createElement(RichTextContent, {
      value:
        'Boa tarde,<div><br></div><div>Vídeos disponíveis. <a href="https://example.test/materiais/?uc=NEURO" onclick="alert(1)">Clicar aqui</a></div><img src=x onerror="alert(1)"><a href="javascript:alert(1)">Perigoso</a>',
    }),
  );
  assert.ok(
    html.includes(
      '<div>Vídeos disponíveis. <a href="https://example.test/materiais/?uc=NEURO" target="_blank" rel="noopener noreferrer">Clicar aqui</a></div>',
    ),
  );
  assert.ok(!html.includes("&lt;div&gt;"));
  assert.ok(!/onclick|onerror|javascript:|<img\b/.test(html));
  assert.equal(
    richText.richTextPlainText("Texto <strong>formatado</strong>"),
    "Texto formatado",
  );
});
