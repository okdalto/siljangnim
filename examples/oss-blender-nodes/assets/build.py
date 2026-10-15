import bpy, math, json, os
from mathutils import Vector
os.makedirs('out',exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def material(name,color):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=.32;return m
blue=material('Blue',(.025,.34,.75));gold=material('Gold',(.95,.47,.035));floor=material('Floor',(.07,.10,.15))
bpy.ops.mesh.primitive_cube_add(size=2,location=(0,0,-.22));ground=bpy.context.object;ground.name='Ground';ground.scale=(5,5,.2);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);ground.data.materials.append(floor)
bpy.ops.object.camera_add(location=(8,-11,9));camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,.7))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=8;bpy.context.scene.camera=camera
for loc,power,size in [((2,-4,8),1600,5),((-5,-1,5),1200,4),((0,4,7),1800,4)]:
 bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size;light.rotation_euler=(-light.location).to_track_quat('-Z','Y').to_euler()
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=12;s.cycles.use_denoising=True;s.render.resolution_x=640;s.render.resolution_y=480;s.render.resolution_percentage=100;s.world.color=(.15,.15,.15);s.render.image_settings.file_format='PNG';s.render.fps=30
# FEATURE_BODY
bpy.ops.mesh.primitive_plane_add(size=1,location=(0,0,.4));obj=bpy.context.object;obj.name='Geometry Nodes point instances'
g=bpy.data.node_groups.new('Grid of varied instances','GeometryNodeTree');g.interface.new_socket(name='Geometry',in_out='INPUT',socket_type='NodeSocketGeometry');g.interface.new_socket(name='Geometry',in_out='OUTPUT',socket_type='NodeSocketGeometry')
n=g.nodes;l=g.links
grid=n.new('GeometryNodeMeshGrid');grid.inputs['Size X'].default_value=4.5;grid.inputs['Size Y'].default_value=4.5
ico=n.new('GeometryNodeMeshIcoSphere');ico.inputs['Radius'].default_value=1;ico.inputs['Subdivisions'].default_value=2
rand=n.new('FunctionNodeRandomValue');rand.data_type='FLOAT';rand.inputs['Min'].default_value=.12;rand.inputs['Max'].default_value=.32;rand.inputs['Seed'].default_value=7
inst=n.new('GeometryNodeInstanceOnPoints');l.new(grid.outputs['Mesh'],inst.inputs['Points']);l.new(ico.outputs['Mesh'],inst.inputs['Instance']);l.new(rand.outputs['Value'],inst.inputs['Scale'])
real=n.new('GeometryNodeRealizeInstances');l.new(inst.outputs['Instances'],real.inputs['Geometry'])
mat=n.new('GeometryNodeSetMaterial');mat.inputs['Material'].default_value=gold;l.new(real.outputs['Geometry'],mat.inputs['Geometry'])
output=n.new('NodeGroupOutput');l.new(mat.outputs['Geometry'],output.inputs['Geometry'])
for i,node in enumerate([grid,ico,rand,inst,real,mat,output]):node.location=(i*220,0)
mod=obj.modifiers.new('Procedural grid','NODES');mod.node_group=g
records=[]
for i,count in enumerate([4,7,10]):
 grid.inputs['Vertices X'].default_value=count;grid.inputs['Vertices Y'].default_value=count;bpy.context.view_layer.update()
 ev=obj.evaluated_get(bpy.context.evaluated_depsgraph_get());mesh=ev.to_mesh();verts=len(mesh.vertices);ev.to_mesh_clear()
 assert verts==count*count*42,(count,verts)
 records.append({'grid_side':count,'instances':count*count,'evaluated_vertices':verts})
 s.render.filepath=os.path.abspath('out/result-%d.png'%i);bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath('out/procedural.blend'))
json.dump({'blender':bpy.app.version_string,'nodes':[x.bl_idname for x in n],'variants':records},open('out/metrics.json','w'),indent=2)
