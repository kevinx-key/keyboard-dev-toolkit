// Type-C 3D 模型装配校准工具。
// 用途：读出模型质心与底部 4 个定位凸点的质心，用于校准 pcb-export.ts 中
//       TYPEC_MODEL_CENTER / TYPEC_LEG_CENTROID 常量。
// 运行：cargo run --example typec_probe --release
use cadrum::{Solid, Tessellation};

fn main() {
    let path = std::env::args().nth(1).unwrap_or_else(|| "models/type-c-connector-3d.stp".to_string());
    let data = std::fs::read(&path).expect("read");
    let mut cur = std::io::Cursor::new(data);
    let solids = Solid::read_step(&mut cur).expect("step");
    let c = solids[0].center();
    let bb = solids[0].bounding_box();
    println!("MODEL_CENTER ({:.4}, {:.4}, {:.4})", c.x, c.y, c.z);
    println!("BBOX ({:.4},{:.4},{:.4})..({:.4},{:.4},{:.4})", bb[0].x, bb[0].y, bb[0].z, bb[1].x, bb[1].y, bb[1].z);

    let te = Tessellation { deflection_linear: 0.01, relative_linear: false, ..Default::default() };
    let mesh = Solid::mesh(&solids, te).expect("mesh");
    // 最底 0.2mm 内的顶点 = 4 个定位凸点
    let pts: Vec<_> = mesh.vertices.iter().filter(|v| v.z <= bb[0].z + 0.2).collect();
    let mmx = pts.iter().map(|v| v.x).sum::<f64>() / pts.len() as f64;
    let mmy = pts.iter().map(|v| v.y).sum::<f64>() / pts.len() as f64;
    // 按质心分 4 象限
    let mut q = [(0usize, 0.0, 0.0); 4];
    for v in &pts {
        let i = (if v.x < mmx { 0 } else { 1 }) + (if v.y < mmy { 0 } else { 2 });
        q[i].0 += 1; q[i].1 += v.x; q[i].2 += v.y;
    }
    for (i, (n, sx, sy)) in q.iter().enumerate() {
        if *n > 0 {
            println!("LEG[{}] n={} ({:.4}, {:.4})", i, n, sx / *n as f64, sy / *n as f64);
        }
    }
    let lx = q.iter().filter(|t| t.0 > 0).map(|t| t.1 / t.0 as f64).sum::<f64>() / 4.0;
    let ly = q.iter().filter(|t| t.0 > 0).map(|t| t.2 / t.0 as f64).sum::<f64>() / 4.0;
    println!("LEG_CENTROID ({:.4}, {:.4})", lx, ly);
}
