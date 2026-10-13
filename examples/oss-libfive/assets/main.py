import ctypes as c,pathlib,sys,json,math,collections
lib=c.CDLL(sys.argv[1]);T=c.c_void_p
class V(c.Structure):_fields_=[('x',c.c_float),('y',c.c_float),('z',c.c_float)]
class Tri(c.Structure):_fields_=[('a',c.c_uint32),('b',c.c_uint32),('c',c.c_uint32)]
class Interval(c.Structure):_fields_=[('lower',c.c_float),('upper',c.c_float)]
class Region(c.Structure):_fields_=[('X',Interval),('Y',Interval),('Z',Interval)]
class Mesh(c.Structure):_fields_=[('verts',c.POINTER(V)),('tris',c.POINTER(Tri)),('tri_count',c.c_uint32),('vert_count',c.c_uint32)]
lib.libfive_opcode_enum.argtypes=[c.c_char_p];lib.libfive_opcode_enum.restype=c.c_int
for name in ['x','y','z']:getattr(lib,'libfive_tree_'+name).restype=T
lib.libfive_tree_const.argtypes=[c.c_float];lib.libfive_tree_const.restype=T
lib.libfive_tree_binary.argtypes=[c.c_int,T,T];lib.libfive_tree_binary.restype=T
lib.libfive_tree_unary.argtypes=[c.c_int,T];lib.libfive_tree_unary.restype=T
lib.libfive_tree_delete.argtypes=[T]
lib.libfive_tree_render_mesh_st.argtypes=[T,Region,c.c_float];lib.libfive_tree_render_mesh_st.restype=c.POINTER(Mesh)
lib.libfive_mesh_delete.argtypes=[c.POINTER(Mesh)]
owned=[]
def keep(p):
 assert p;owned.append(p);return p
def scalar(x):return keep(lib.libfive_tree_const(x))
def op(name,*args):
 code=lib.libfive_opcode_enum(name.encode());assert code>=0,name
 return keep((lib.libfive_tree_unary if len(args)==1 else lib.libfive_tree_binary)(code,*args))
frames=[]
try:
 x,y,z=[keep(getattr(lib,'libfive_tree_'+k)()) for k in 'xyz']
 radial=op('add',op('square',x),op('square',z));sphere=op('sub',op('add',radial,op('square',y)),scalar(.85**2))
 for radius in [.15,.30,.45]:
  cylinder=op('sub',radial,scalar(radius**2));shape=op('max',sphere,op('neg',cylinder))
  ptr=lib.libfive_tree_render_mesh_st(shape,Region(Interval(-1,1),Interval(-1,1),Interval(-1,1)),12.);assert ptr
  try:
   m=ptr.contents;vertices=[[float(v.x),float(v.y),float(v.z)] for v in m.verts[:m.vert_count]];faces=[[int(t.a),int(t.b),int(t.c)] for t in m.tris[:m.tri_count]]
  finally:lib.libfive_mesh_delete(ptr)
  assert len(faces)>100 and all(math.isfinite(v) for p in vertices for v in p)
  edges=collections.Counter()
  for face in faces:
   assert len(set(face))==3 and min(face)>=0 and max(face)<len(vertices)
   for a,b in zip(face,face[1:]+face[:1]):edges[tuple(sorted((a,b)))]+=1
  assert all(n==2 for n in edges.values())
  frames.append({'label':'Bore radius '+str(radius),'radius':radius,'mesh':{'vertices':vertices,'faces':faces},'closed':True})
  print('PASS native libfive mesh',radius,len(vertices),len(faces))
finally:
 for p in reversed(owned):lib.libfive_tree_delete(p)
pathlib.Path('out/result.json').write_text(json.dumps({'frames':frames}))
