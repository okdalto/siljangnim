package main

import (
	"encoding/json"
	"github.com/fogleman/simplify"
	"math"
	"os"
	"path/filepath"
)

var out string

func save(v interface{}) {
	b, e := json.Marshal(v)
	if e != nil {
		panic(e)
	}
	if e = os.WriteFile(filepath.Join(out, "result.json"), b, 0644); e != nil {
		panic(e)
	}
}
func main() {
	out = os.Args[1]
	if err := os.MkdirAll(out, 0755); err != nil {
		panic(err)
	}
	const n = 20
	vertices := []simplify.Vector{}
	for z := 0; z < n; z++ {
		for x := 0; x < n; x++ {
			a := float64(x)/float64(n-1)*1.6 - .8
			b := float64(z)/float64(n-1)*1.6 - .8
			vertices = append(vertices, simplify.Vector{a, .25 * math.Sin(a*7) * math.Cos(b*4), b})
		}
	}
	triangles := []*simplify.Triangle{}
	for z := 0; z < n-1; z++ {
		for x := 0; x < n-1; x++ {
			i := z*n + x
			triangles = append(triangles, simplify.NewTriangle(vertices[i], vertices[i+1], vertices[i+n]), simplify.NewTriangle(vertices[i+1], vertices[i+n+1], vertices[i+n]))
		}
	}
	frames := []interface{}{}
	for _, ratio := range []float64{1, .5, .2} {
		mesh := simplify.NewMesh(triangles)
		if ratio < 1 {
			mesh = mesh.Simplify(ratio)
		}
		if len(mesh.Triangles) == 0 || ratio < 1 && len(mesh.Triangles) >= len(triangles) {
			panic("invalid reduction")
		}
		v := [][3]float64{}
		f := [][3]int{}
		for _, t := range mesh.Triangles {
			start := len(v)
			for _, p := range []simplify.Vector{t.V1, t.V2, t.V3} {
				if math.IsNaN(p.X + p.Y + p.Z) {
					panic("nonfinite vertex")
				}
				v = append(v, [3]float64{p.X, p.Y, p.Z})
			}
			f = append(f, [3]int{start, start + 1, start + 2})
		}
		frames = append(frames, map[string]interface{}{"mesh": map[string]interface{}{"vertices": v, "faces": f}})
	}
	save(map[string]interface{}{"frames": frames})
}
