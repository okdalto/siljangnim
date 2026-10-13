extends Node3D
var water
var frame := 0
var output := OS.get_environment("OCEAN_OUTPUT")
var snapshots := []
func _ready():
 var sky_material := ProceduralSkyMaterial.new()
 var sky := Sky.new()
 sky.sky_material = sky_material
 var env := Environment.new()
 env.background_mode = Environment.BG_SKY
 env.sky = sky
 env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
 var world := WorldEnvironment.new()
 world.environment = env
 add_child(world)
 var sun := DirectionalLight3D.new()
 sun.rotation_degrees = Vector3(-40,-30,0)
 sun.light_energy = 2.0
 add_child(sun)
 var camera := Camera3D.new()
 camera.position = Vector3(0,4,9)
 add_child(camera)
 camera.look_at(Vector3(0,0,-12))
 camera.current = true
 water = load('res://assets/water/water.gd').new()
 water.map_size = 128
 water.mesh_quality = water.MeshQuality.LOW
 water.mesh = water.WATER_MESH_LOW
 water.material_override = water.WATER_MAT
 add_child(water)
 var a := WaveCascadeParameters.new()
 a.wind_speed=12.0
 a.tile_length=Vector2(88,88)
 a.foam_amount=3.0
 var b := WaveCascadeParameters.new()
 b.wind_speed=6.0
 b.tile_length=Vector2(38,38)
 b.displacement_scale=0.5
 var cascades: Array[WaveCascadeParameters] = [a,b]
 water.parameters=cascades
 water.updates_per_second=0
 water.set_process(false)
func _process(_delta):
 frame += 1
 water._update_water(1.0/60.0)
 if frame in [30,90,180]:
  await RenderingServer.frame_post_draw
  var image := get_viewport().get_texture().get_image()
  var index := snapshots.size()
  assert(image.save_png(output+"/render-%d.png"%index)==OK)
  snapshots.append({"label":"Frame %d"%frame,"frame":frame,"mapSize":128,"cascades":2})
  if frame==180:
   FileAccess.open(output+"/result.json",FileAccess.WRITE).store_string(JSON.stringify({"frames":snapshots}))
   print("PASS original GodotOceanWaves GPU FFT and water renderer")
   get_tree().quit()
