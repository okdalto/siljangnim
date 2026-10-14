const {app,BrowserWindow}=require('electron');const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const [source,output]=process.argv.slice(2);if(process.env.KEPLER_PROFILE)app.setPath('userData',process.env.KEPLER_PROFILE);app.commandLine.appendSwitch('force-device-scale-factor','1');
app.whenReady().then(async()=>{let server,win;try{
const root=path.resolve(source);fs.mkdirSync(output,{recursive:true});server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('Content-Type',({'.js':'application/javascript; charset=utf-8','.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.ttf':'font/ttf'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file))}catch{res.writeHead(404).end()}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
win=new BrowserWindow({width:512,height:512,useContentSize:true,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});win.webContents.session.webRequest.onBeforeRequest({urls:['*://*/*']},(details,callback)=>callback({cancel:!details.url.startsWith('http://127.0.0.1:')}));const errors=[];win.webContents.on('console-message',(_e,level,message,line,source)=>{if(level>=3){errors.push(message);console.log('PAGE',message,line,source)}});
const frames=[];for(const [index,longitude]of [0,1,2].entries()){
await win.loadURL('http://127.0.0.1:'+server.address().port+'/capture.html?view='+index);
for(let n=0;n<300&&!await win.webContents.executeJavaScript('!!window.__ready');n++)await new Promise(r=>setTimeout(r,100));
const result=await win.webContents.executeJavaScript('window.__result');if(!result||result.points!==2400||result.layers.length!==1||result.type!==['point','grid','hexagon'][index])throw Error('Native Kepler verification failed '+JSON.stringify(result));
await new Promise(r=>setTimeout(r,80));const screenshot=await win.webContents.capturePage();fs.writeFileSync(path.join(output,'render-'+index+'.png'),screenshot.toPNG());frames.push(result);
}
if(errors.length)throw Error(errors.join('\n'));fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({frames}));console.log('PASS original kepler.gl dataset and layer rendering');app.exit(0);
}catch(error){console.error(error);app.exit(1)}finally{win?.destroy();server?.close()}});
