package main

import (
	"encoding/json"
	"fmt"
	"github.com/fogleman/pt/pt"
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
	materials := []pt.Material{pt.DiffuseMaterial(pt.HexColor(0x42c6aa)), pt.GlossyMaterial(pt.HexColor(0x42c6aa), 1.5, pt.Radians(12)), pt.MetallicMaterial(pt.HexColor(0xd6c19b), pt.Radians(8), 1)}
	for i, material := range materials {
		scene := pt.Scene{Color: pt.Color{.12, .15, .2}}
		scene.Add(pt.NewSphere(pt.V(0, .7, 0), .7, material))
		scene.Add(pt.NewCube(pt.V(-20, -.15, -20), pt.V(20, 0, 20), pt.DiffuseMaterial(pt.HexColor(0x87939e))))
		scene.Add(pt.NewSphere(pt.V(-1, 4, 2), .9, pt.LightMaterial(pt.White, 18)))
		camera := pt.LookAt(pt.V(2, 1.4, 4), pt.V(0, .5, 0), pt.V(0, 1, 0), 38)
		renderer := pt.NewRenderer(&scene, &camera, pt.NewSampler(4, 5), 256, 256)
		renderer.NumCPU = 2
		renderer.Verbose = false
		renderer.SamplesPerPixel = 20
		image := renderer.Render()
		if err := pt.SavePNG(filepath.Join(out, fmt.Sprintf("render-%d.png", i)), image); err != nil {
			panic(err)
		}
	}
	save(map[string]interface{}{"samples_per_pixel": 20, "max_bounces": 5, "cpu_workers": 2})
}
