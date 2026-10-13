import project from './project?project';
import {Renderer,Vector2} from '@motion-canvas/core';
const errors=[];project.logger.onLogged.subscribe(e=>{if(e.level==='error')errors.push(e.message)});
const renderer=new Renderer(project);
document.body.append(renderer.stage.finalBuffer);
window.capture=async(time)=>{
 await renderer.renderFrame({size:new Vector2(512,384),resolutionScale:1,colorSpace:'srgb',background:'#101827',name:'capture',range:[0,5],fps:30,exporter:{name:'',options:{}}},time);
 if(errors.length)throw Error(errors.join('\n'));
 return renderer.stage.finalBuffer.toDataURL('image/png');
};
