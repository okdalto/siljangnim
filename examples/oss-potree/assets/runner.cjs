const {app,BrowserWindow}=require('electron');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const [source,output]=process.argv.slice(2);
if(process.env.POTREE_PROFILE)app.setPath('userData',process.env.POTREE_PROFILE);
app.commandLine.appendSwitch('force-device-scale-factor','1');
app.whenReady().then(async()=>{let server,win;try{
 const root=path.resolve(source);fs.mkdirSync(output,{recursive:true});
 server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}try{res.setHeader('Content-Type',path.extname(file)==='.js'?'application/javascript; charset=utf-8':'text/html; charset=utf-8');res.end(fs.readFileSync(file))}catch{res.writeHead(404).end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 win=new BrowserWindow({width:512,height:384,useContentSize:true,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 const errors=[];win.webContents.on('console-message',(event)=>{if(event.details)console.log('DETAIL',JSON.stringify(event.details))});win.webContents.on('console-message',(_e,level,message,line,source)=>{if(level>=3){errors.push(message);console.log('PAGE',message,line,source)}});
 await win.loadURL('http://127.0.0.1:'+server.address().port+'/capture.html');
 for(let i=0;i<100&&!await win.webContents.executeJavaScript('typeof window.capture==="function"');i++)await new Promise(r=>setTimeout(r,100));
 const frames=[];for(const index of [0,1,2]){
  const result=await win.webContents.executeJavaScript('window.capture('+index+')');const png=result.png;delete result.png;if(result.points!==6400||result.visiblePoints!==6400)throw Error('Unexpected loaded point count '+JSON.stringify(result));
  fs.writeFileSync(path.join(output,'render-'+index+'.png'),Buffer.from(png.split(',')[1],'base64'));
  frames.push(result);
 }
 if(errors.length)throw Error(errors.join('\n'));
 fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({frames}));
 console.log('PASS original Potree loader and renderer with 6400 visible points');app.exit(0);
}catch(error){console.error(error);app.exit(1)}finally{win?.destroy();server?.close()}});
