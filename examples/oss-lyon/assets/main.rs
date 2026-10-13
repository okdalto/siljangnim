use serde_json::json;
fn main() {
let out=std::path::PathBuf::from(std::env::args().nth(1).expect("output directory"));std::fs::create_dir_all(&out).unwrap();

use lyon::{math::point,path::Path,tessellation::*};let mut builder=Path::builder();builder.begin(point(-0.8,0.0));builder.cubic_bezier_to(point(-0.8,-0.9),point(0.7,-0.9),point(0.8,0.0));builder.quadratic_bezier_to(point(0.0,0.9),point(-0.8,0.0));builder.end(true);let path=builder.build();let mut frames=vec![];
for tolerance in [0.1,0.02,0.004]{let mut geometry:VertexBuffers<[f32;2],u16>=VertexBuffers::new();FillTessellator::new().tessellate_path(&path,&FillOptions::default().with_tolerance(tolerance),&mut BuffersBuilder::new(&mut geometry,|vertex:FillVertex|vertex.position().to_array())).unwrap();assert!(geometry.indices.len()>3);let paths:Vec<_>=geometry.indices.chunks(3).map(|f|json!({"points":[geometry.vertices[f[0]as usize],geometry.vertices[f[1]as usize],geometry.vertices[f[2]as usize],geometry.vertices[f[0]as usize]]})).collect();frames.push(json!({"paths":paths}));}let result=json!({"frames":frames});

std::fs::write(out.join("result.json"),serde_json::to_vec(&result).unwrap()).unwrap();
}
