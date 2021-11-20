
import linaria from '@linaria/esbuild'
import esbuild from 'esbuild'

if (process.argv.length !== 4) {
  console.log(`
Usage:
  ${process.argv[1]} <entryPoint> <outDir>

entryPoint: file to be converted
outputDir: destination directory
`)
  process.exit(1)
}

esbuild
  .build({
    entryPoints: [process.argv[2]],
    bundle: true,
    outdir: process.argv[3],
    minify: false,
    nodePaths: ['build/web', 'vendor'],
    loader: {
      '.svg': 'dataurl',
      '.png': 'dataurl',
    },
    target: [
      'esnext'
    ],
    format: 'esm',
    jsxFactory: 'h',
    jsxFragment: 'Fragment',
    define: {
      'process.env.NODE_ENV' : '"development"',
    },
    plugins: [
      linaria.default({
        sourceMap: true,
      }),
    ],
  })
  .catch (() => process.exit(1));
