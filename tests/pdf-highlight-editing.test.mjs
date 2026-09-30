import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import ts from "typescript";
import { materialReaderHref } from "../lib/material-reader.ts";
import { MATERIAL_RESOURCE_CATEGORIES, materialResourceCategory } from "../lib/material-categories.ts";

const compiled = ts.transpileModule(readFileSync(new URL("../worker/materials-catalog.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const catalogWorker = { exports: {} };
new Function("module", "exports", "require", compiled)(catalogWorker, catalogWorker.exports, (specifier) => specifier === "@/lib/material-categories" ? { MATERIAL_RESOURCE_CATEGORIES, materialResourceCategory } : {});

test("compêndios abrem diretamente no PDF e outros documentos mantêm o anotador", () => {
  assert.equal(materialReaderHref("c", { otherFormat: "compendium", viewUrl: "/api/material-catalog/c/view" }), "/api/material-catalog/c/view");
  assert.equal(materialReaderHref("s", { otherFormat: "slides", viewUrl: "/api/material-catalog/s/view" }), "/materiais/ler/?id=s");
});

test("ajustar seleção guarda a geometria no mesmo realce, preserva nota/cor e protege outra conta", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE users(id TEXT PRIMARY KEY); INSERT INTO users VALUES('owner'),('other');");
  db.exec("CREATE TABLE material_catalog(id TEXT PRIMARY KEY,mime_type TEXT,publication_status TEXT); INSERT INTO material_catalog VALUES('pdf','application/pdf','published');");
  db.exec(readFileSync(new URL("../migrations/0063_material_pdf_highlights.sql", import.meta.url), "utf8"));
  db.exec(readFileSync(new URL("../migrations/0073_material_pdf_highlight_rects.sql", import.meta.url), "utf8"));
  db.prepare("INSERT INTO material_pdf_highlights VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run("hl","owner","pdf",2,.1,.2,.3,.04,"gold","original","nota",1,1,'[{"x":0.1,"y":0.2,"width":0.3,"height":0.04}]');
  const env = { DB: { prepare(sql) {
    const statement = db.prepare(sql); let values = [];
    return { bind(...args) { values = args; return this; }, async first() { return statement.get(...values); }, async run() { return { meta: statement.run(...values) }; } };
  } } };
  const url = new URL("https://example.test/api/material-catalog/pdf/highlights");
  const request = (user, changes) => catalogWorker.exports.handleMaterialsCatalogRoute(new Request(url, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id:"hl", ...changes }) }), env, url, { id:user, role:"student" }, async () => true);
  try {
    assert.equal((await request("other", { note:"intrusão" })).status, 404);
    const response = await request("owner", { color:"blue", note:"nova nota", selectedText:"texto corrigido" });
    assert.equal(response.status, 200);
    const updated = (await response.json()).highlight;
    assert.equal(updated.selectedText, "texto corrigido");
    assert.equal(updated.note, "nova nota");
    assert.equal(updated.color, "blue");
    assert.deepEqual([updated.page,updated.x,updated.y,updated.width,updated.height], [2,.1,.2,.3,.04]);
    assert.equal(updated.rects.length, 1);
    assert.equal((await request("owner", { color:"invalid" })).status, 400);
    assert.equal(db.prepare("SELECT color FROM material_pdf_highlights").get().color, "blue");
    const rects = [{ x:.05,y:.2,width:.4,height:.04 }, { x:.1,y:.26,width:.2,height:.04 }];
    assert.equal((await request("other", { rects, selectedText:"texto alargado" })).status, 404);
    const resized = await request("owner", { rects, selectedText:"texto alargado" });
    assert.equal(resized.status, 200);
    const shape = (await resized.json()).highlight;
    assert.deepEqual(shape.rects, rects);
    assert.deepEqual([shape.page,shape.x,shape.y,shape.width], [2,.05,.2,.4]);
    assert.ok(Math.abs(shape.height - .1) < 1e-9);
    assert.equal(shape.note, "nova nota");
    assert.equal(shape.color, "blue");
    assert.equal(shape.selectedText, "texto alargado");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM material_pdf_highlights").get().n, 1);
    assert.deepEqual(JSON.parse(db.prepare("SELECT rects FROM material_pdf_highlights").get().rects), rects);
    for (const invalid of [null, "rects", [], Array(81).fill(rects[0]), [{x:-.1,y:.2,width:.3,height:.03}],[{x:.9,y:.2,width:.3,height:.03}], [...rects,{x:0,y:0,width:0,height:0}]]) {
      assert.equal((await request("owner", { rects:invalid })).status, 400);
    }
    assert.deepEqual(JSON.parse(db.prepare("SELECT rects FROM material_pdf_highlights").get().rects), rects);
  } finally { db.close(); }
});
