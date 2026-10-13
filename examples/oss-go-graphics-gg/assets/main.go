package main

import (
	"encoding/json"
	"fmt"
	"github.com/fogleman/gg"
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
	for frame, count := range []int{6, 9, 12} {
		dc := gg.NewContext(512, 512)
		dc.SetHexColor("0b1625")
		dc.Clear()
		dc.Translate(256, 256)
		for i := 0; i < count; i++ {
			dc.Push()
			dc.Rotate(float64(i) * 2 * math.Pi / float64(count))
			dc.DrawEllipse(0, 87, 48, 118)
			dc.SetRGBA(.22, .8, .7, .55)
			dc.FillPreserve()
			dc.SetRGBA(.8, .94, .9, .7)
			dc.SetLineWidth(1.5)
			dc.Stroke()
			dc.Pop()
		}
		dc.DrawCircle(0, 0, 32)
		dc.SetHexColor("ffbc78")
		dc.Fill()
		if err := dc.SavePNG(filepath.Join(out, fmt.Sprintf("render-%d.png", frame))); err != nil {
			panic(err)
		}
	}
	save(map[string]interface{}{"petals": []int{6, 9, 12}})
}
