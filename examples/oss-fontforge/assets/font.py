import fontforge,sys,pathlib,json
out=pathlib.Path(sys.argv[1]);out.mkdir(exist_ok=True,parents=True);frames=[]
for i,weight in [(int(sys.argv[2]),[0,40,80][int(sys.argv[2])])]:
 f=fontforge.font();f.fontname='OriginalGlyph'+str(i);f.familyname='OriginalGlyph';f.fullname=f.fontname;f.em=1000;f.ascent=800;f.descent=200
 g=f.createChar(65);g.width=850;p=g.glyphPen();p.moveTo((80,0));p.lineTo((350,700));p.lineTo((480,700));p.lineTo((760,0));p.lineTo((600,0));p.lineTo((535,180));p.lineTo((295,180));p.lineTo((230,0));p.closePath();p.moveTo((345,320));p.lineTo((490,320));p.lineTo((417,525));p.closePath();p=None;g.correctDirection()
 if weight:g.changeWeight(weight)
 g.removeOverlap();g.correctDirection();g.addExtrema();g.round();g.removeOverlap();g.correctDirection();print("validation",g.validate(True));assert g.validate(True)==0
 frames.append({'weight':weight,'bounds':list(g.boundingBox()),'contours':len(g.foreground)});g.export(str(out/('glyph-'+str(i)+'.svg')));f.generate(str(out/('font-'+str(i)+'.ttf')));f.close()
(out/('result-'+sys.argv[2]+'.json')).write_text(json.dumps({'frames':frames}))
