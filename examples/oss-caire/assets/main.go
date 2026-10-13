package main

import (
	"encoding/json"
	"fmt"
	"github.com/esimov/caire"
	"image"
	"image/color"
	"image/draw"
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
	for i, width := range []int{128, 104, 80} {
		input := image.NewNRGBA(source.Bounds())
		draw.Draw(input, input.Bounds(), source, image.Point{}, draw.Src)
		processor := caire.Processor{NewWidth: width, NewHeight: 128, SobelThreshold: 4, BlurRadius: 1, Preview: false, FaceDetect: false}
		resized, err := processor.Resize(input)
		if err != nil {
			panic(err)
		}
		if resized.Bounds().Dx() != width || resized.Bounds().Dy() != 128 {
			panic("wrong resize dimensions")
		}
		saveImage(fmt.Sprintf("resized-%d.png", i), resized)
		preview := image.NewRGBA(image.Rect(0, 0, 128, 128))
		draw.Draw(preview, preview.Bounds(), &image.Uniform{C: source.At(0, 0)}, image.Point{}, draw.Src)
		draw.Draw(preview, image.Rect((128-width)/2, 0, (128+width)/2, 128), resized, image.Point{}, draw.Src)
		saveImage(fmt.Sprintf("render-%d.png", i), preview)
	}
	_ = color.Black
	result := map[string]interface{}{"widths": []int{128, 104, 80}, "height": 128}
	b, e := json.Marshal(result)
	if e != nil {
		panic(e)
	}
	if e = os.WriteFile(filepath.Join(out, "result.json"), b, 0644); e != nil {
		panic(e)
	}
}
