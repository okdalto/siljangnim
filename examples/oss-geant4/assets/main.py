from pathlib import Path
import os,sys,json,math,subprocess
root=Path(sys.argv[1]).absolute();os.environ['GEANT4_DATA_DIR']=str(root);os.environ['G4LEDATA']=str(root/'G4EMLOW8.8');os.environ['G4ENSDFSTATEDATA']=str(root/'G4ENSDFSTATE3.0')
os.environ['G4LEVELGAMMADATA']=str(root/'PhotonEvaporation6.1.2')
out=Path('out');out.mkdir(exist_ok=True)
if len(sys.argv)>2:
 from geant4_pybind import *
 thickness=float(sys.argv[2]);case=int(sys.argv[3]);tracks=[]
 class Detector(G4VUserDetectorConstruction):
  def __init__(self):super().__init__()
  def Construct(self):
   nist=G4NistManager.Instance();world=G4LogicalVolume(G4Box('world',10*cm,10*cm,15*cm),nist.FindOrBuildMaterial('G4_Galactic'),'world')
   physical=G4PVPlacement(None,G4ThreeVector(),world,'world',None,False,0,True)
   self.slab=G4LogicalVolume(G4Box('water',4*cm,4*cm,thickness*cm/2),nist.FindOrBuildMaterial('G4_WATER'),'water')
   G4PVPlacement(None,G4ThreeVector(0,0,thickness*cm/2),self.slab,'water',world,False,0,True)
   self.limits=G4UserLimits(.5*mm);self.slab.SetUserLimits(self.limits)
   return physical
 class Generator(G4VUserPrimaryGeneratorAction):
  def __init__(self):
   super().__init__();self.gun=G4ParticleGun(1);self.gun.SetParticleDefinition(G4Electron.ElectronDefinition());self.gun.SetParticleEnergy(10*MeV);self.gun.SetParticleMomentumDirection(G4ThreeVector(0,0,1));self.gun.SetParticlePosition(G4ThreeVector(0,0,-1*cm))
  def GeneratePrimaries(self,event):self.gun.GeneratePrimaryVertex(event)
 class Event(G4UserEventAction):
  def __init__(self):super().__init__()
  def BeginOfEventAction(self,event):self.points=[];self.energyDeposit=0;self.exitEnergy=None
  def EndOfEventAction(self,event):tracks.append({'points':self.points,'energyDeposit':self.energyDeposit,'exitEnergy':self.exitEnergy})
 class Stepping(G4UserSteppingAction):
  def __init__(self,event):super().__init__();self.event=event
  def UserSteppingAction(self,step):
   pre=step.GetPreStepPoint();post=step.GetPostStepPoint();track=step.GetTrack()
   if pre.GetTouchable().GetVolume().GetName()=='water':self.event.energyDeposit+=step.GetTotalEnergyDeposit()/MeV
   if track.GetParentID()!=0:return
   p=post.GetPosition();point=[p.z/cm,p.x/cm,p.y/cm,post.GetKineticEnergy()/MeV]
   assert all(math.isfinite(v) for v in point);self.event.points.append(point)
   if p.z>thickness*cm and self.event.exitEnergy is None:self.event.exitEnergy=post.GetKineticEnergy()/MeV
   if p.z>(thickness+1)*cm or len(self.event.points)>2000:track.SetTrackStatus(G4TrackStatus.fStopAndKill)
 class Actions(G4VUserActionInitialization):
  def Build(self):
   event=Event();self.SetUserAction(Generator());self.SetUserAction(event);self.SetUserAction(Stepping(event))
 G4Random.setTheSeed(17)
 manager=G4RunManagerFactory.CreateRunManager(G4RunManagerType.Serial)
 detector=Detector();physics=G4VModularPhysicsList();actions=Actions()
 physics.RegisterPhysics(G4EmStandardPhysics());physics.RegisterPhysics(G4StepLimiterPhysics());physics.SetVerboseLevel(0);physics.SetDefaultCutValue(.1*mm)
 manager.SetUserInitialization(detector)
 manager.SetUserInitialization(physics)
 for particle in ["gamma","e-","e+","proton"]:physics.SetCutValue(.1*mm,particle)
 manager.SetUserInitialization(actions)
 manager.Initialize();manager.BeamOn(48)
 assert len(tracks)==48 and all(t['points'] for t in tracks)
 result={'thickness':thickness,'tracks':tracks,'meanEnergyDeposit':sum(t['energyDeposit'] for t in tracks)/48,'transmitted':sum(t['exitEnergy'] is not None for t in tracks)}
 (out/f'case-{case}.json').write_text(json.dumps(result));print('PASS original Geant4 electron transport',thickness,result['meanEnergyDeposit'],result['transmitted'],flush=True)
 # geant4-pybind 0.1.3 crashes during Python callback teardown on this Mac.
 # This isolated worker has finished all native events and closed its result file.
 # Avoid the faulty finalizer; the OS reclaims the worker's native allocations.
 sys.stdout.flush();sys.stderr.flush();os._exit(0)
else:
 from PIL import Image,ImageDraw,ImageFont
 frames=[]
 for i,thickness in enumerate([1,3,5]):
  subprocess.run([sys.executable,str(Path(__file__).absolute()),str(root),str(thickness),str(i)],check=True,timeout=180)
  p=out/f'case-{i}.json';result=json.loads(p.read_text());p.unlink();im=Image.new('RGB',(640,400),'#101c2a');d=ImageDraw.Draw(im)
  project=lambda z,x:(60+(z+1)/8*520,205-x/6*155)
  a=project(0,4);b=project(thickness,-4);d.rectangle((a,b),fill='#1e3b50',outline='#476479')
  for n,track in enumerate(result['tracks']):
   points=[project(-1,0)]+[project(v[0],v[1]) for v in track['points']]
   if len(points)>1:d.line(points,fill=['#57d8c6','#80b4e8','#e9ba71'][n%3],width=1)
  d.text((22,15),f'Geant4 / 10 MeV electrons / water {thickness} cm',font=ImageFont.load_default(size=20),fill='#edf2f8')
  d.text((22,370),f'48 primary tracks | mean deposit {result["meanEnergyDeposit"]:.3f} MeV',font=ImageFont.load_default(size=16),fill='#bdc9da')
  im.save(out/f'render-{i}.png');frames.append(result)
 assert all(0<f['meanEnergyDeposit']<=10.001 for f in frames)
 assert frames[-1]['meanEnergyDeposit']>frames[0]['meanEnergyDeposit']
 (out/'result.json').write_text(json.dumps({'frames':frames,'engine':'Geant4 through geant4-pybind 0.1.3','primaryEnergyMeV':10,'eventsPerCase':48}))
