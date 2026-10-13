use serde_json::json;
fn main() {
let out=std::path::PathBuf::from(std::env::args().nth(1).expect("output directory"));std::fs::create_dir_all(&out).unwrap();

let mut frames=vec![];let n=33;for mode in 0..3{let mut vertices=vec![];for y in 0..n{for x in 0..n{let a=x as f64/(n-1)as f64;let b=y as f64/(n-1)as f64;let noise=if mode==0{opensimplex2::fast::noise2(17,a*3.0,b*3.0)}else if mode==1{opensimplex2::smooth::noise2(17,a*3.0,b*3.0)}else{(0..4).map(|k|opensimplex2::smooth::noise2(17+k,a*3.0*2.0f64.powi(k as i32),b*3.0*2.0f64.powi(k as i32))/2.0f32.powi(k as i32)).sum::<f32>()/1.875};assert!(noise.is_finite()&&noise.abs()<1.05);vertices.push([a*1.6-0.8,noise as f64*0.3,b*1.6-0.8]);}}let mut faces=vec![];for y in 0..n-1{for x in 0..n-1{let i=y*n+x;faces.push([i,i+1,i+n]);faces.push([i+1,i+n+1,i+n]);}}frames.push(json!({"mesh":{"vertices":vertices,"faces":faces}}));}let result=json!({"frames":frames});

std::fs::write(out.join("result.json"),serde_json::to_vec(&result).unwrap()).unwrap();
}
