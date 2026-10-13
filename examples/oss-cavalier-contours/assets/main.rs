use serde_json::json;
fn main() {
let out=std::path::PathBuf::from(std::env::args().nth(1).expect("output directory"));std::fs::create_dir_all(&out).unwrap();

use cavalier_contours::{pline_closed,polyline::*};let original=pline_closed![(-0.4,-0.35,0.0),(0.4,-0.35,1.0),(0.4,0.35,0.0),(-0.4,0.35,1.0)];let mut frames=vec![];let mut areas=vec![];
for distance in [-0.15,0.0,0.15]{let polylines=if distance==0.0{vec![original.clone()]}else{original.parallel_offset(distance)};assert_eq!(polylines.len(),1);areas.push(polylines[0].area());let paths:Vec<_>=polylines.iter().map(|p|{let flat=p.arcs_to_approx_lines(0.002).unwrap();let mut points:Vec<[f64;2]>=flat.iter_vertexes().map(|v|[v.x,v.y]).collect();points.push(points[0]);json!({"points":points})}).collect();frames.push(json!({"paths":paths}));}assert!(areas[0]>areas[1]&&areas[1]>areas[2]);let result=json!({"frames":frames,"areas":areas});

std::fs::write(out.join("result.json"),serde_json::to_vec(&result).unwrap()).unwrap();
}
