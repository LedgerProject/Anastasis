const ts = require("typescript");

const configPath = ts.findConfigFile(
    /*searchPath*/ "./",
    ts.sys.fileExists,
    "tsconfig.json"
  );
if (!configPath) {
  throw new Error("Could not find a valid 'tsconfig.json'.");
}

console.log(configPath);

const cmdline = ts.getParsedCommandLineOfConfigFile(configPath, {}, {
  fileExists: ts.sys.fileExists,
  getCurrentDirectory: ts.sys.getCurrentDirectory,
  onUnRecoverableConfigFileDiagnostic: (e) => console.log(e),
  readDirectory: ts.sys.readDirectory,
  readFile: ts.sys.readFile,
  useCaseSensitiveFileNames: true,
})

console.log(cmdline);

const prog = ts.createProgram({
  options: cmdline.options,
  rootNames: cmdline.fileNames,
});

const allFiles = prog.getSourceFiles();

console.log(allFiles.map(x => x.path));