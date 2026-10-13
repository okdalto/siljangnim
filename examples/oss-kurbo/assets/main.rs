use serde_json::json;
fn main() {
let out=std::path::PathBuf::from(std::env::args().nth(1).expect("output directory"));std::fs::create_dir_all(&out).unwrap();

use kurbo::{BezPath,PathEl};let mut path=BezPath::new();path.move_to((-0.85,0.3));path.curve_to((-0.5,-1.0),(0.4,1.0),(0.85,-0.3));let mut frames=vec![];
for tolerance in [0.1,0.02,0.004]{let mut points=vec![];kurbo::flatten(path.iter(),tolerance,|el|{if let PathEl::MoveTo(p)|PathEl::LineTo(p)=el{points.push([p.x,p.y]);}});assert!(points.len()>=3);assert_eq!(points[0],[-0.85,0.3]);assert_eq!(*points.last().unwrap(),[0.85,-0.3]);frames.push(json!({"paths":[{"points":points}],"points":points,"radius":0.012}));}let result=json!({"frames":frames});

std::fs::write(out.join("result.json"),serde_json::to_vec(&result).unwrap()).unwrap();
}
