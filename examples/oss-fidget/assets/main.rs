use serde_json::json;
fn main() {
let out=std::path::PathBuf::from(std::env::args().nth(1).expect("output directory"));std::fs::create_dir_all(&out).unwrap();

use fidget::{context::Tree,shape::{Shape,EzShape},vm::VmShape};let a=((Tree::x()+0.25).square()+Tree::y().square()+Tree::z().square()).sqrt()-0.5;let b=((Tree::x()-0.4).square()+(Tree::y()-0.1).square()+Tree::z().square()).sqrt()-0.35;let shape=VmShape::from(a.min(b));let tape=shape.ez_float_slice_tape();let mut eval=VmShape::new_float_slice_eval();let mut xs=vec![];let mut ys=vec![];for y in 0..65{for x in 0..65{xs.push(x as f32/64.0*1.8-0.9);ys.push(y as f32/64.0*1.8-0.9);}}let mut frames=vec![];
for z in [0.0,0.25,0.45]{let zs=vec![z;xs.len()];let values=eval.eval(&tape,&xs,&ys,&zs).unwrap();assert!(values.iter().all(|v|v.is_finite()));let mut points=vec![];let mut colors=vec![];for(i,&value)in values.iter().enumerate(){if value<0.0{points.push([xs[i],ys[i]]);colors.push((value*3.0).clamp(-1.0,1.0));}}assert!(!points.is_empty());frames.push(json!({"points":points,"values":colors,"radius":0.014}));}let result=json!({"frames":frames});

std::fs::write(out.join("result.json"),serde_json::to_vec(&result).unwrap()).unwrap();
}
