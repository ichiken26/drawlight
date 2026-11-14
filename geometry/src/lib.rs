use wasm_bindgen::prelude::*;

/// Return a coordinate snapped to the nearest positive grid interval.
#[wasm_bindgen]
pub fn snap_to_grid(value: f64, grid: f64) -> f64 {
    if !value.is_finite() || !grid.is_finite() || grid <= 0.0 {
        return value;
    }
    (value / grid).round() * grid
}

/// Orthogonal connector with a single central bend. Rendered as SVG path data.
#[wasm_bindgen]
pub fn orthogonal_path(sx: f64, sy: f64, tx: f64, ty: f64) -> String {
    if (tx - sx).abs() >= (ty - sy).abs() {
        let mid = (sx + tx) / 2.0;
        format!("M {sx} {sy} L {mid} {sy} L {mid} {ty} L {tx} {ty}")
    } else {
        let mid = (sy + ty) / 2.0;
        format!("M {sx} {sy} L {sx} {mid} L {tx} {mid} L {tx} {ty}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn grid_snap() {
        assert_eq!(snap_to_grid(22.0, 16.0), 16.0);
        assert_eq!(snap_to_grid(25.0, 16.0), 32.0);
        assert_eq!(snap_to_grid(-20.0, 16.0), -16.0);
    }
    #[test]
    fn orthogonal_routes() {
        assert_eq!(orthogonal_path(0.0, 0.0, 100.0, 60.0), "M 0 0 L 50 0 L 50 60 L 100 60");
    }
}
