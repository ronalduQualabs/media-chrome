import { createRequire } from "module";
const require = createRequire(import.meta.url);
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
const { dirname } = path;
import { GlobalThis } from '../../dist/utils/server-safe-globals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Funciones auxiliares
const clearAndUpper = (kebabText) => kebabText.replace(/-/, "").toUpperCase();
const toPascalCase = (kebabText) =>
  kebabText.replace(/(^\w|-\w)/g, clearAndUpper);

// Generación de imports y módulos de SolidJS
const toImportsStr = ({ importPath, utilsBase }) => {
  return `import { createEffect, splitProps } from "solid-js";
import "${importPath}";
import { toNativeProps } from "${utilsBase}/common/utils.js";
`;
};

const toSolidComponentStr = (config) => {
  const { elementName } = config;
  const SolidComponentName = toPascalCase(elementName);
  return `const ${SolidComponentName} = (props) => {
  const [local, others] = splitProps(props, ["children", "ref"]);
  let el;
  createEffect(() => {
    if (local.ref) local.ref(el);
  });
  return (
    <${elementName}
      ref={(e) => (el = e)}
      {...toNativeProps(others)}
    >
      {local.children}
    </${elementName}>
  );
};`;
};

const toExportsStr = (config) => {
  const { elementName } = config;
  const SolidComponentName = toPascalCase(elementName);
  return `export { ${SolidComponentName} };`;
};

const toCustomElementSolidWrapperModule = (config) => {
  const moduleStr = `${toSolidComponentStr(config)}

${toExportsStr(config)}
`;

  return moduleStr;
};

// Tipos de TypeScript para SolidJS
const toTypeImportsAndGenericDefinitionsStr = () => {
  return `import type { JSX } from "solid-js";

declare global {
  interface Element {
    slot?: string;
  }
}

type GenericProps = { [k: string]: any };
type GenericElement = HTMLElement;
`;
};

const toDeclarationStr = (config) => {
  const { elementName } = config;
  const SolidComponentName = toPascalCase(elementName);
  return `declare const ${SolidComponentName}: (props: GenericProps) => JSX.Element;`;
};

const toCustomElementSolidTypeDeclaration = (config) => {
  const typeDeclarationStr = `${toDeclarationStr(config)}
${toExportsStr(config)}
`;

  return typeDeclarationStr;
};

// Creación de los módulos
const entryPointsToSolidModulesIterable = (
  entryPoints,
  { getDefinedCustomElements }
) => {
  let alreadyDefinedCustomElementNames = [];
  return {
    [Symbol.asyncIterator]() {
      return {
        i: 0,
        next() {
          const { i } = this;
          if (i >= entryPoints.length) return Promise.resolve({ done: true });

          const { importPath, distRoot } = entryPoints[i];
          const importPathAbs = require.resolve(importPath);
          const importPathObj = path.parse(importPathAbs);
          const name = importPathObj.name.replace(/-element$/, "");

          const relativeDir = path.dirname(
            path.relative(distRoot, importPathAbs)
          );
          const distSolidRoot = path.join(distRoot, "solid", relativeDir);

          const modulePathAbs = path.format({
            dir: distSolidRoot,
            name,
            ext: ".js",
          });
          const tsDeclPathAbs = path.format({
            dir: distSolidRoot,
            name,
            ext: ".d.ts",
          });

          return import(importPath)
            .then((_) => {
              const customElementNames = getDefinedCustomElements();
              const undefinedCustomElementNames = customElementNames.filter(
                (name) => !alreadyDefinedCustomElementNames.includes(name)
              );

              const componentsWithExports = undefinedCustomElementNames.map(
                (elementName) => {
                  return toCustomElementSolidWrapperModule({
                    elementName,
                  });
                }
              );

              fs.mkdirSync(path.dirname(modulePathAbs), { recursive: true });

              const importPathRelative = path.relative(distSolidRoot, importPathAbs);
              const utilsBase = path.dirname(
                path.relative(importPathAbs, distRoot)
              );
              const moduleStr = `${toImportsStr({
                importPath: importPathRelative,
                utilsBase,
              })}\n${componentsWithExports.join("\n")}`;

              fs.writeFileSync(modulePathAbs, moduleStr);

              const declarationsWithExports = undefinedCustomElementNames.map(
                (elementName) => {
                  return toCustomElementSolidTypeDeclaration({ elementName });
                }
              );

              const tsDeclStr = `${toTypeImportsAndGenericDefinitionsStr()}\n${declarationsWithExports.join(
                "\n"
              )}`;

              fs.writeFileSync(tsDeclPathAbs, tsDeclStr);

              alreadyDefinedCustomElementNames = [...customElementNames];

              return {
                modulePath: modulePathAbs,
                moduleContents: moduleStr,
                tsDeclarationPath: tsDeclPathAbs,
                tsDeclarationContents: tsDeclStr,
              };
            })
            .then((moduleDef) => {
              this.i++;
              return { value: moduleDef, done: false };
            })
            .catch((err) => {
              return Promise.reject({ value: err });
            });
        },
      };
    },
  };
};

// Configuración inicial
const createSolidWrapperModules = async ({
  entryPoints,
  setupGlobalsAsync,
  distRoot = "./",
  commonModulesSrcRoot = path.join(__dirname, "common"),
}) => {
  return setupGlobalsAsync().then(async (customElementNames) => {
    if (!entryPoints?.length) {
      console.error("No entrypoints! Bailing.");
      return;
    }

    const distSolidRoot = path.join(distRoot, "solid");

    fs.mkdirSync(distSolidRoot, { recursive: true });

    const commonModulesDistPath = path.join(distSolidRoot, "common");
    fs.mkdirSync(commonModulesDistPath, { recursive: true });
    fs.readdirSync(commonModulesSrcRoot, { withFileTypes: true }).forEach(
      (dirEntryObj) => {
        const { name } = dirEntryObj;
        fs.copyFileSync(
          path.format({ name, dir: commonModulesSrcRoot }),
          path.format({ name, dir: commonModulesDistPath })
        );
      }
    );

    const moduleCreateAsyncIterable = entryPointsToSolidModulesIterable(
      entryPoints,
      { getDefinedCustomElements: () => customElementNames, distRoot }
    );

    try {
      for await (let moduleDef of moduleCreateAsyncIterable) {
        const { modulePath, moduleContents } = moduleDef;
        console.log(
          "Solid module wrapper created!",
          "path (absolute):",
          modulePath
        );
      }
    } catch (err) {
      console.log("Unexpected error generating module!", err);
    }

    console.log("Module generation completed!");
  });
};

export { toCustomElementSolidWrapperModule };

// Código de configuración añadido al final:
const projectRoot = path.join(__dirname, "..", "..");
const distRoot = path.join(projectRoot, "dist");
const entryPoints = [
  path.join(projectRoot, "dist", "index.js"),
  path.join(projectRoot, "dist", "menu", "index.js"),
  path.join(projectRoot, "dist", "media-theme-element.js"),
];
const setupGlobalsAsync = async () => {
    const globalThis = GlobalThis;
    globalThis.customElementNames = [];
    globalThis.customElements.define = (name, _classRef) =>
      globalThis.customElementNames.push(name);
    return globalThis.customElementNames;
};

createSolidWrapperModules({ entryPoints, setupGlobalsAsync, distRoot });