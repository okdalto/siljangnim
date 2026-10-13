package main

import (
	"encoding/json"
	"github.com/fogleman/ln/ln"
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
	scene := ln.Scene{}
	scene.Add(ln.NewCube(ln.Vector{-.65, -.65, -.65}, ln.Vector{.45, .45, .45}))
	scene.Add(ln.NewSphere(ln.Vector{.5, .25, .25}, .65))
	frames := []interface{}{}
	for _, angle := range []float64{.5, 1.5, 2.5} {
		eye := ln.Vector{3 * math.Cos(angle), 3 * math.Sin(angle), 1.8}
		paths := scene.Render(eye, ln.Vector{}, ln.Vector{0, 0, 1}, 400, 400, 42, .1, 20, .025)
		if len(paths) < 10 {
			panic("empty hidden-line result")
		}
		lines := []interface{}{}
		for _, path := range paths {
			points := [][2]float64{}
			for _, p := range path {
				points = append(points, [2]float64{p.X/220 - .91, p.Y/220 - .91})
			}
			lines = append(lines, map[string]interface{}{"points": points, "color": "#57d8c6"})
		}
		frames = append(frames, map[string]interface{}{"paths": lines})
	}
	save(map[string]interface{}{"frames": frames})
}
