package main

import (
	"encoding/json"
	"fmt"
	"github.com/RH12503/Triangula/algorithm"
	"github.com/RH12503/Triangula/algorithm/evaluator"
	"github.com/RH12503/Triangula/fitness"
	imageData "github.com/RH12503/Triangula/image"
	"github.com/RH12503/Triangula/mutation"
	"github.com/RH12503/Triangula/normgeom"
	"github.com/RH12503/Triangula/random"
	"github.com/RH12503/Triangula/rasterize"
	"github.com/RH12503/Triangula/render"
	"github.com/RH12503/Triangula/triangulation"
	"image"
	"image/color"
	"image/png"
	"math/rand"
	"os"
	"path/filepath"
	"runtime"
)

var out string

func saveImage(name string, img image.Image) {
	f, e := os.Create(filepath.Join(out, name))
	if e != nil {
		panic(e)
	}
	defer f.Close()
	if e = png.Encode(f, img); e != nil {
		panic(e)
	}
}
func main() {
	out = os.Args[1]
	if e := os.MkdirAll(out, 0755); e != nil {
		panic(e)
	}
	file, e := os.Open(os.Args[2])
	if e != nil {
		panic(e)
	}
	source, e := png.Decode(file)
	file.Close()
	if e != nil {
		panic(e)
	}
	runtime.GOMAXPROCS(2)
	rng := rand.New(rand.NewSource(11))
	random.Seed(11)
	data := imageData.ToData(source)
	factory := func() normgeom.NormPointGroup {
		p := normgeom.NormPointGroup{}
		for i := 0; i < 50; i++ {
			p = append(p, normgeom.NormPoint{X: rng.Float64(), Y: rng.Float64()})
		}
		return p
	}
	evaluators := func(n int) evaluator.Evaluator {
		return evaluator.NewParallel(fitness.TrianglesImageFunctions(data, 4, n), 14)
	}
	algo := algorithm.NewModifiedGenetic(factory, 24, 4, evaluators, mutation.NewGaussianMethod(.03, .25))
	scores := []float64{}
	frame := 0
	for step := 1; step <= 120; step++ {
		algo.Step()
		if step == 20 || step == 60 || step == 120 {
			triangles := triangulation.Triangulate(algo.Best(), 128, 128)
			colors := render.TrianglesOnImage(triangles, data)
			img := image.NewRGBA(image.Rect(0, 0, 128, 128))
			for i, t := range triangles {
				c := colors[i].Color
				value := color.RGBA{uint8(c.R * 255), uint8(c.G * 255), uint8(c.B * 255), 255}
				rasterize.DDATriangle(t, func(x, y int) { img.Set(x, y, value) })
			}
			saveImage(fmt.Sprintf("render-%d.png", frame), img)
			scores = append(scores, algo.Stats().BestFitness)
			frame++
		}
	}
	if scores[2] < scores[0] {
		panic("fitness regressed")
	}
	result := map[string]interface{}{"fitness": scores, "points": 50, "population": 24, "generations": []int{20, 60, 120}}
	b, e := json.Marshal(result)
	if e != nil {
		panic(e)
	}
	if e = os.WriteFile(filepath.Join(out, "result.json"), b, 0644); e != nil {
		panic(e)
	}
}
