import { describe, expect, it } from "vitest";

import { prodTransitiveDependencies, renderDependenciesModule } from "./prodDependencyTree.mjs";

/** Мінімальний лок: лише те, що читає модуль. */
function lockOf(packages) {
  return { packages: { "": { name: "app" }, ...packages } };
}

describe("prodTransitiveDependencies", () => {
  it("знаходить транзитивну залежність і каже, через кого вона приїхала", () => {
    const lock = lockOf({
      "node_modules/@tiptap/starter-kit": { version: "3.30.0", dependencies: { "@tiptap/core": "^3" } },
      "node_modules/@tiptap/react": { version: "3.30.0", dependencies: { "@tiptap/core": "^3" } },
      "node_modules/@tiptap/core": { version: "3.30.0" },
    });
    const pkg = { dependencies: { "@tiptap/starter-kit": "^3", "@tiptap/react": "^3" } };

    expect(prodTransitiveDependencies(lock, pkg)).toEqual([
      { name: "@tiptap/core", version: "3.30.0", via: ["@tiptap/react", "@tiptap/starter-kit"] },
    ]);
  });

  it("не повертає наші власні пакети й не йде крізь них", () => {
    const lock = lockOf({
      "node_modules/a": { version: "1.0.0", dependencies: { b: "^1" } },
      "node_modules/b": { version: "1.0.0", dependencies: { c: "^1" } },
      "node_modules/c": { version: "1.0.0" },
    });
    const pkg = { dependencies: { a: "^1", b: "^1" } };

    // c тягне b, а не a: дірку в c має бачити рядок b, а не обидва.
    expect(prodTransitiveDependencies(lock, pkg)).toEqual([{ name: "c", version: "1.0.0", via: ["b"] }]);
  });

  it("розрізняє вкладені копії різних версій", () => {
    const lock = lockOf({
      "node_modules/a": { version: "1.0.0", dependencies: { ms: "^1" } },
      "node_modules/a/node_modules/ms": { version: "1.0.0" },
      "node_modules/b": { version: "1.0.0", dependencies: { ms: "^2" } },
      "node_modules/ms": { version: "2.1.3" },
    });
    const pkg = { dependencies: { a: "^1", b: "^1" } };

    expect(prodTransitiveDependencies(lock, pkg)).toEqual([
      { name: "ms", version: "1.0.0", via: ["a"] },
      { name: "ms", version: "2.1.3", via: ["b"] },
    ]);
  });

  it("dev-гілку пропускає, devOptional лишає — як npm audit --omit=dev", () => {
    const lock = lockOf({
      "node_modules/vite": { version: "8.0.0", dependencies: { esbuild: "^0.28", rollup: "^4" } },
      "node_modules/esbuild": { version: "0.28.1", devOptional: true },
      "node_modules/rollup": { version: "4.0.0", dev: true },
      "node_modules/vitest": { version: "4.0.0", dev: true, dependencies: { chai: "^5" } },
      "node_modules/chai": { version: "5.0.0", dev: true },
    });
    // vite у devDependencies, але в локі без dev — його пірово тягне прод.
    const pkg = { dependencies: {}, devDependencies: { vite: "^8", vitest: "^4" } };

    expect(prodTransitiveDependencies(lock, pkg)).toEqual([{ name: "esbuild", version: "0.28.1", via: ["vite"] }]);
  });

  it("аліас питає npm під справжнім ім'ям", () => {
    const lock = lockOf({
      "node_modules/a": { version: "1.0.0", dependencies: { "old-name": "npm:real-name@^2" } },
      "node_modules/old-name": { name: "real-name", version: "2.0.0" },
    });

    expect(prodTransitiveDependencies(lock, { dependencies: { a: "^1" } })).toEqual([
      { name: "real-name", version: "2.0.0", via: ["a"] },
    ]);
  });
});

describe("renderDependenciesModule", () => {
  it("однаковий вхід — однаковий текст: на цьому стоїть сторож знімка", () => {
    const list = [{ name: "c", version: "1.0.0", via: ["b"] }];
    expect(renderDependenciesModule(list)).toBe(renderDependenciesModule(structuredClone(list)));
    expect(renderDependenciesModule(list)).toContain('  {"name":"c","version":"1.0.0","via":["b"]},');
  });
});
