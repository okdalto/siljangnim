import bpy, math
from mathutils import Vector
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def mat(name,color,metal=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=.27;return m
jade=mat('Jade',(.035,.5,.38),.25);gold=mat('Gold',(.95,.48,.12),.65);coral=mat('Coral',(.85,.13,.12));floor=mat('Floor',(.13,.17,.23))
bpy.ops.mesh.primitive_plane_add(size=200);bpy.context.object.data.materials.append(floor)
bpy.ops.mesh.primitive_uv_sphere_add(segments=48,ring_count=24,location=(-.65,0,.85));o=bpy.context.object;o.scale=(.62,.62,.85);o.data.materials.append(jade);bpy.ops.object.shade_smooth()
bpy.ops.mesh.primitive_torus_add(major_radius=.48,minor_radius=.16,location=(.65,.25,.7),rotation=(math.pi/2,0,.3));bpy.context.object.data.materials.append(gold);bpy.ops.object.shade_smooth()
bpy.ops.mesh.primitive_cube_add(size=.7,location=(.45,-.65,.36),rotation=(0,0,.2));o=bpy.context.object;o.data.materials.append(coral);mod=o.modifiers.new('Rounded','BEVEL');mod.width=.08;mod.segments=4;o.modifiers.new('Normals','WEIGHTED_NORMAL')
bpy.ops.object.camera_add(location=(3,-5,3));camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,.65))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=3.4;bpy.context.scene.camera=camera
for loc,power,size in [((1,-3,5),650,4),((-3,-1,2),350,3),((0,3,4),800,3)]:
 bpy.ops.object.light_add(type='AREA',location=loc);light=bpy.context.object;light.data.energy=power;light.data.shape='DISK';light.data.size=size;light.rotation_euler=(-light.location).to_track_quat('-Z','Y').to_euler()
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.samples=24;s.cycles.use_denoising=True;s.render.resolution_x=512;s.render.resolution_y=512;s.render.resolution_percentage=100;s.world.color=(.2,.2,.2);s.render.image_settings.file_format='PNG';s.render.filepath='out/still-life.png';bpy.ops.wm.save_as_mainfile(filepath='out/still-life.blend');bpy.ops.render.render(write_still=True)
