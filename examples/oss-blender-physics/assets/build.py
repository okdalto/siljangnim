import bpy, math, json, os
from mathutils import Vector
os.makedirs('out',exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def material(name,color):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=.32;return m
blue=material('Blue',(.025,.34,.75));gold=material('Gold',(.95,.47,.035));floor=material('Floor',(.07,.10,.15))
bpy.ops.mesh.primitive_cube_add(size=2,location=(0,0,-.22));ground=bpy.context.object;ground.name='Ground';ground.scale=(5,5,.2);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);ground.data.materials.append(floor)
bpy.ops.object.camera_add(location=(8,-11,9));camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,1.5))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=9;bpy.context.scene.camera=camera
for loc,power,size in [((2,-4,8),1600,5),((-5,-1,5),1200,4),((0,4,7),1800,4)]:
 bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size;light.rotation_euler=(-light.location).to_track_quat('-Z','Y').to_euler()
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=12;s.cycles.use_denoising=True;s.render.resolution_x=640;s.render.resolution_y=480;s.render.resolution_percentage=100;s.world.color=(.15,.15,.15);s.render.image_settings.file_format='PNG';s.render.fps=30
# FEATURE_BODY
bpy.context.view_layer.objects.active=ground;ground.select_set(True);bpy.ops.rigidbody.object_add();ground.rigid_body.type='PASSIVE';ground.rigid_body.collision_shape='BOX';ground.select_set(False)
objects=[]
for i in range(12):
 bpy.ops.mesh.primitive_cube_add(size=.65,location=((i%3-1)*.95,(i//3-1.5)*.8,2+(i%4)*.55),rotation=(.15*i,.12*i,.3*i));o=bpy.context.object;o.name='Falling block %02d'%i;o.data.materials.append(blue if i%2 else gold)
 bpy.ops.rigidbody.object_add();o.rigid_body.mass=1;o.rigid_body.collision_shape='BOX';o.rigid_body.restitution=.25;o.rigid_body.friction=.7
 bevel=o.modifiers.new('Bevel','BEVEL');bevel.width=.035;bevel.segments=3;objects.append(o)
s.frame_end=90;s.rigidbody_world.substeps_per_frame=10;s.rigidbody_world.solver_iterations=20;s.rigidbody_world.point_cache.frame_end=90
records=[]
for frame in range(1,91):
 s.frame_set(frame);dg=bpy.context.evaluated_depsgraph_get();positions=[list(o.evaluated_get(dg).matrix_world.translation) for o in objects]
 records.append({'frame':frame,'positions':positions})
 if frame in [1,18,90]:
  index=[1,18,90].index(frame);s.render.filepath=os.path.abspath('out/result-%d.png'%index);bpy.ops.render.render(write_still=True)
a=sum(p[2] for p in records[0]['positions'])/12;b=sum(p[2] for p in records[-1]['positions'])/12
assert a-b>1.5 and min(p[2] for p in records[-1]['positions'])>.2,(a,b)
s.frame_set(1);bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath('out/physics.blend'))
json.dump({'blender':bpy.app.version_string,'objects':12,'initial_mean_height':a,'final_mean_height':b,'trajectory':records},open('out/metrics.json','w'),indent=2)
