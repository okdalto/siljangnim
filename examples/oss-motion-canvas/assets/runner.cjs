const {app,BrowserWindow}=require('electron');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const [source,output]=process.argv.slice(2);
if(process.env.MOTION_PROFILE)app.setPath('userData',process.env.MOTION_PROFILE);
app.whenReady().then(async()=>{let server,win;try{
 const root=path.resolve(source);fs.mkdirSync(output,{recursive:true});
 server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('Content-Type',path.extname(file)==='.js'?'application/javascript':'text/html');res.end(fs.readFileSync(file))}catch{res.writeHead(404).end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 win=new BrowserWindow({width:540,height:420,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 const errors=[];win.webContents.on('console-message',(_e,level,message)=>{if(level>=3)errors.push(message)});
 await win.loadURL('http://127.0.0.1:'+server.address().port+'/capture.html');
 for(let i=0;i<100&&!await win.webContents.executeJavaScript('typeof window.capture==="function"');i++)await new Promise(r=>setTimeout(r,100));
 const frames=[];for(const [index,time]of [0,2,4].entries()){
  const png=await win.webContents.executeJavaScript('window.capture('+time+')');
  fs.writeFileSync(path.join(output,'render-'+index+'.png'),Buffer.from(png.split(',')[1],'base64'));
  frames.push({label:time+' seconds',time,fps:30});
 }
 if(errors.length)throw Error(errors.join('\n'));
 fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({frames}));
 console.log('PASS original Motion Canvas Renderer at 0, 2 and 4 seconds');app.exit(0);
}catch(error){console.error(error);app.exit(1)}finally{win?.destroy();server?.close()}});
