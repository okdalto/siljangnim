package main

import (
	"encoding/json"
	"fmt"
	"github.com/makeworld-the-better-one/dither/v2"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
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
	for i := 0; i < 3; i++ {
		d := dither.NewDitherer([]color.Color{color.Black, color.White})
		if i == 0 {
			d.Matrix = dither.FloydSteinberg
		} else if i == 1 {
			d.Matrix = dither.Atkinson
		} else {
			d.Mapper = dither.Bayer(8, 8, 1)
		}
		img := d.DitherCopy(source)
		for y := 0; y < 128; y++ {
			for x := 0; x < 128; x++ {
				r, g, b, a := img.At(x, y).RGBA()
				if (r != 0 && r != 65535) || r != g || g != b || a != 65535 {
					panic("pixel outside palette")
				}
			}
		}
		saveImage(fmt.Sprintf("render-%d.png", i), img)
	}
	result := map[string]interface{}{"palette": "black and white", "input_size": 128}
	b, e := json.Marshal(result)
	if e != nil {
		panic(e)
	}
	if e = os.WriteFile(filepath.Join(out, "result.json"), b, 0644); e != nil {
		panic(e)
	}
}
