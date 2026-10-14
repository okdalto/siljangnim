const {app,BrowserWindow}=require('electron');const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const [engine,inputs,output]=process.argv.slice(2);if(process.env.PHYSX_PROFILE)app.setPath('userData',process.env.PHYSX_PROFILE);
app.whenReady().then(async()=>{let server,win;try{
const files={'/capture.html':path.join(inputs,'capture.html'),'/driver.mjs':path.join(inputs,'driver.mjs'),'/engine/physx-js-webidl.mjs':path.join(engine,'physx-js-webidl.mjs'),'/engine/physx-js-webidl.wasm':path.join(engine,'physx-js-webidl.wasm')};
server=http.createServer((req,res)=>{const file=files[req.url];if(!file){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.wasm')?'application/wasm':file.endsWith('.mjs')?'application/javascript':'text/html');res.end(fs.readFileSync(file));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
win=new BrowserWindow({width:640,height:480,show:false,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,backgroundThrottling:false}});const origin='http://127.0.0.1:'+server.address().port;
win.webContents.session.webRequest.onBeforeRequest({urls:['*://*/*']},(d,cb)=>cb({cancel:!d.url.startsWith(origin+'/')}));
await win.loadURL(origin+'/capture.html');let result;
for(let i=0;i<600;i++){const state=await win.webContents.executeJavaScript('({result:window.__result,error:window.__error})');if(state.error)throw Error(state.error);if(state.result){result=state.result;break;}await new Promise(r=>setTimeout(r,100));}
if(!result||result.frames.length!==3||!result.frames.every(f=>f.bodies.length===36))throw Error('Original PhysX result validation failed');fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result));console.log('PASS original PhysX',result.engine,result.frames.map(f=>f.meanHeight));win.destroy();server.close();app.quit();
}catch(error){console.error(error);win?.destroy();server?.close();app.exit(1)}});
