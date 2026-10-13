package main

import (
	"encoding/json"
	"github.com/fogleman/contourmap"
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
	frames := []interface{}{}
	palette := []string{"#57d8c6", "#ffbc78", "#ad9bff", "#fa7f9c"}
	for _, size := range []int{24, 48, 96} {
		field := contourmap.FromFunction(size, size, func(x, y int) float64 {
			a := float64(x)/float64(size-1)*4 - 2
			b := float64(y)/float64(size-1)*4 - 2
			return math.Exp(-((a+.6)*(a+.6)+b*b)*2) + .8*math.Exp(-((a-.5)*(a-.5)+(b-.25)*(b-.25))*3)
		})
		paths := []interface{}{}
		for j, level := range []float64{.2, .4, .6, .8} {
			for _, line := range field.Contours(level) {
				if len(line) < 3 {
					continue
				}
				points := [][2]float64{}
				for _, p := range line {
					points = append(points, [2]float64{p.X/float64(size-1)*1.8 - .9, p.Y/float64(size-1)*1.8 - .9})
				}
				paths = append(paths, map[string]interface{}{"points": points, "color": palette[j]})
			}
		}
		if len(paths) < 4 {
			panic("missing contours")
		}
		frames = append(frames, map[string]interface{}{"paths": paths})
	}
	save(map[string]interface{}{"frames": frames})
}
