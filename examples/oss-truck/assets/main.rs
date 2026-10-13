use serde_json::json;
fn main() {
let out=std::path::PathBuf::from(std::env::args().nth(1).expect("output directory"));std::fs::create_dir_all(&out).unwrap();

use truck_modeling::*;use truck_meshalgo::tessellation::{MeshableShape,MeshedShape};let vertex=builder::vertex(Point3::new(0.0,-0.55,0.5));let circle=builder::rsweep(&vertex,Point3::new(0.0,-0.55,0.0),Vector3::unit_y(),Rad(7.0));let disk=builder::try_attach_plane(&[circle]).unwrap();let solid=builder::tsweep(&disk,Vector3::new(0.0,1.1,0.0));let mut frames=vec![];
for tolerance in [0.1,0.03,0.008]{let mesh=solid.triangulation(tolerance).to_polygon();let vertices:Vec<_>=mesh.positions().iter().map(|p|[p.x,p.y,p.z]).collect();let faces:Vec<_>=mesh.faces().tri_faces().iter().map(|f|[f[0].pos,f[1].pos,f[2].pos]).collect();assert!(faces.len()>10);assert!(vertices.iter().all(|p|p.iter().all(|x|x.is_finite())));frames.push(json!({"mesh":{"vertices":vertices,"faces":faces}}));}let result=json!({"frames":frames});

std::fs::write(out.join("result.json"),serde_json::to_vec(&result).unwrap()).unwrap();
}
