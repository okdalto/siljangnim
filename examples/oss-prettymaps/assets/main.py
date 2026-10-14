from pathlib import Path
import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import geopandas as gpd
from shapely.geometry import Point,LineString,box
from shapely.affinity import translate
import prettymaps
from prettymaps.draw import Plot
out=Path('out');out.mkdir(exist_ok=True)
def gdf(shapes):return gpd.GeoDataFrame(geometry=[translate(s,500000,4500000) for s in shapes],crs='EPSG:32631')
perimeter=Point(0,0).buffer(470)
river=LineString([(-480,-230),(-230,-130),(0,40),(280,160),(480,280)]).buffer(30)
parks=[Point(-220,220).buffer(85),Point(230,-200).buffer(65)]
streets=[LineString([(x,-500),(x,500)]) for x in range(-400,401,100)]+[LineString([(-500,y),(500,y)]) for y in range(-400,401,100)]
buildings=[]
for x in range(-375,400,50):
 for y in range(-375,400,50):
  shape=box(x-16,y-16,x+16,y+16)
  if perimeter.contains(shape) and not river.intersects(shape) and not any(p.intersects(shape) for p in parks):buildings.append(shape)
features={'perimeter':gdf([perimeter]),'water':gdf([river.intersection(perimeter)]),'parks':gdf(parks),'streets':gdf([s.intersection(perimeter) for s in streets]),'building':gdf(buildings)}
frames=[]
for i,(bg,water,park,street,palette) in enumerate([
 ('#f2e6ce','#84a9ad','#adc59b','#fff7df',['#d4a373','#c88c71','#e6bc91']),
 ('#182535','#517d94','#426b61','#a2aabd',['#dcad78','#b77873','#b0bdcc']),
 ('#f5f3ef','#c4ced1','#d8dbcf','#ffffff',['#848b8c','#b1b7b3','#a3aaa7'])]):
 np.random.seed(17);fig,ax=plt.subplots(figsize=(5.12,5.12),dpi=100)
 styles={'background':{'fc':bg,'ec':bg,'pad':1.08},'perimeter':{'fc':bg,'ec':street,'lw':1},'water':{'fc':water,'ec':water},'parks':{'fc':park,'ec':park},'streets':{'fc':street,'ec':street,'lw':0},'building':{'palette':palette,'ec':bg,'lw':.35}}
 copied={k:v.copy() for k,v in features.items()}
 native=prettymaps.plot('',backup=Plot(copied,None,None,None),preset=None,layers={'streets':{'width':5}},style=styles,fig=fig,ax=ax,credit=False,show=False)
 assert len(native.geodataframes['building'])==len(buildings)>100
 assert all(g.geometry.is_valid.all() for g in native.geodataframes.values())
 fig.savefig(out/f'render-{i}.png',dpi=100);plt.close(fig)
 frames.append({'label':['Warm paper','Night ink','Graphite'][i],'buildings':len(buildings),'layers':len(features)})
(out/'result.json').write_text(json.dumps({'frames':frames}));print('PASS original prettymaps plot pipeline with supplied synthetic geodataframes')
