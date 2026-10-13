import pathlib,subprocess,json,math
import numpy as np
from astropy.io import fits
from astropy.wcs import WCS
out=pathlib.Path('out');out.mkdir(exist_ok=True);rng=np.random.default_rng(1729);ra=150+rng.uniform(-3,3,600);dec=20+rng.uniform(-3,3,600);cols=[fits.Column(name='RA',format='D',array=ra),fits.Column(name='DEC',format='D',array=dec)];fits.BinTableHDU.from_columns(cols).writeto(out/'catalog.fits',overwrite=True);index=(out/'index-original.fits').absolute()
if index.exists():index.unlink()
subprocess.run(['build-astrometry-index','-i',str(out/'catalog.fits'),'-o',str(index),'-N','32','-l','30','-u','60','-E','-M','-I','9911'],check=True)
config=out/'backend.cfg';config.write_text('inparallel\nindex '+str(index)+'\n');frames=[]
for i,angle in enumerate([0,25,60]):
 a=math.radians(angle);truth=WCS(naxis=2);truth.wcs.crpix=[256,256];truth.wcs.crval=[150,20];truth.wcs.ctype=['RA---TAN','DEC--TAN'];truth.wcs.cd=.008*np.array([[-math.cos(a),math.sin(a)],[math.sin(a),math.cos(a)]]);xy=truth.all_world2pix(np.stack([ra,dec],axis=1),1);mask=np.all((xy>8)&(xy<504),axis=1);xy=xy[mask];sky=np.stack([ra[mask],dec[mask]],axis=1);assert len(xy)>100
 inp=out/f'stars-{i}.xyls';fits.BinTableHDU.from_columns([fits.Column(name='X',format='D',array=xy[:,0]),fits.Column(name='Y',format='D',array=xy[:,1])]).writeto(inp,overwrite=True)
 (out/f'solved-{i}.wcs').unlink(missing_ok=True)
 subprocess.run(['solve-field','--config',str(config),'--no-plots','--overwrite','--width','512','--height','512','--scale-units','degwidth','--scale-low','3','--scale-high','5','--ra','150','--dec','20','--radius','5','--cpulimit','30','--dir',str(out),'--out',f'solved-{i}',str(inp)],check=True)
 solved=out/f'solved-{i}.wcs';assert solved.exists(),'Native plate solve failed';wcs=WCS(fits.getheader(solved));projected=wcs.all_world2pix(sky,1);error=float(np.max(np.linalg.norm(projected-xy,axis=1)));assert error<.1,error
 paths=[]
 for r in np.linspace(148,152,9):
  p=wcs.all_world2pix(np.stack([np.full(60,r),np.linspace(18,22,60)],axis=1),1);paths.append({'points':((p-256)/280).round(8).tolist(),'color':'#355d75'})
 for d in np.linspace(18,22,9):
  p=wcs.all_world2pix(np.stack([np.linspace(148,152,60),np.full(60,d)],axis=1),1);paths.append({'points':((p-256)/280).round(8).tolist(),'color':'#355d75'})
 frames.append({'angle':angle,'stars':len(xy),'maxPixelError':round(error,8),'points':((xy-256)/280).round(8).tolist(),'radius':.009,'paths':paths});print('SOLVED',angle,len(xy),error,flush=True)
(out/'result.json').write_text(json.dumps({'frames':frames},allow_nan=False))
