import fs from "fs";
import path from "path";
import * as rollup from "rollup";
import ts from "typescript";

/**
 * Returns a plugin that automatically transforms TypeScript files by adding dummy exports for types.
 *
 * For example:
 * ```ts
 * export type SomeType = string;
 * ```
 *
 * will become:
 * ```ts
 * export type SomeType = string;
 * const __fakeValueExport__ = null;
 * export { __fakeValueExport__ as SomeType };
 * ```
 *
 * This allows browsers not to crash when they encounter an import statement such as:
 * ```ts
 * import { SomeType } from './foo';
 * ```
 */
export = function fakeExportedTypesPlugin(
  options: {
    readFile?: (id: string) => Promise<string | null>;
  } = {}
): rollup.Plugin {
  const readFile =
    options.readFile ||
    (async (id) => {
      try {
        return await fs.promises.readFile(id, "utf8");
      } catch {
        return null;
      }
    });
  return {
    name: "reactpreview-fake-exported-types",
    transform: async function (transformedCode, id) {
      const ext = path.extname(id);
      if (ext.startsWith(".js")) {
        return;
      }
      const fileContent = await readFile(id);
      if (fileContent === null) {
        return;
      }
      const isJSX = ext.endsWith("x");
      const sourceFile = ts.createSourceFile(
        id,
        fileContent,
        ts.ScriptTarget.Latest,
        false,
        isJSX ? ts.ScriptKind.TSX : ts.ScriptKind.TS
      );
      return `${transformedCode}
const __fakeValueExport__ = null;
export { ${findExportsWithNoValue(sourceFile)
        .map((e) => `__fakeValueExport__ as ${e}`)
        .join(", ")} };`;
    },
  };
};

function findExportsWithNoValue(sourceFile: ts.SourceFile): string[] {
  const types = new Set<string>();
  const values = new Set<string>();
  const exported: {
    [name: string]: {
      asType: boolean;
      asValue: boolean;
    };
  } = {};

  function recordExport(
    name: string,
    { asType, asValue }: { asType?: boolean; asValue?: boolean }
  ) {
    const e = exported[name] || { asType: false, asValue: false };
    e.asType = e.asType || asType || false;
    e.asValue = e.asValue || asValue || false;
    exported[name] = e;
  }

  for (const statement of sourceFile.statements) {
    if (
      ts.isTypeAliasDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement)
    ) {
      const name = statement.name.text;
      types.add(name);
      if (hasExportModifier(statement)) {
        recordExport(name, { asType: true });
      }
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          const name = declaration.name.text;
          values.add(name);
          if (hasExportModifier(statement)) {
            recordExport(name, { asValue: true });
          }
        }
      }
    } else if (ts.isFunctionDeclaration(statement)) {
      if (statement.name) {
        const name = statement.name.text;
        values.add(name);
        if (hasExportModifier(statement)) {
          recordExport(name, { asValue: true });
        }
      }
    } else if (
      ts.isClassDeclaration(statement) ||
      ts.isEnumDeclaration(statement)
    ) {
      if (statement.name) {
        const name = statement.name.text;
        types.add(name);
        values.add(name);
        if (hasExportModifier(statement)) {
          recordExport(name, { asType: true, asValue: true });
        }
      }
    } else if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      !statement.moduleSpecifier &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        const name = (element.propertyName || element.name).text;
        recordExport(name, { asType: true, asValue: !statement.isTypeOnly });
      }
    }
  }
  const exportsWithNoValue = new Set<string>();
  for (const [name, e] of Object.entries(exported)) {
    if (!types.has(name)) {
      // No need for a fake value export if there is no type, because
      // nobody will import that as a type.
      continue;
    }
    if (e.asValue && values.has(name)) {
      // No need for a fake value export.
      continue;
    }
    exportsWithNoValue.add(name);
  }

  return [...exportsWithNoValue];
}

function hasExportModifier(node: ts.Node) {
  return (
    node.modifiers &&
    node.modifiers.findIndex((m) => m.kind === ts.SyntaxKind.ExportKeyword) !==
      -1
  );
}
