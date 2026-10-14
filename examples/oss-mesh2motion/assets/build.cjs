const path=require('node:path');const [entry,cache,web]=process.argv.slice(2);
require(path.join(cache,'runtime/node_modules/esbuild')).buildSync({entryPoints:[entry],outfile:path.join(web,'bundle.js'),bundle:true,format:'iife',platform:'browser',alias:{'@mesh':path.join(cache,'src/lib')},nodePaths:[path.join(cache,'runtime/node_modules')]});
