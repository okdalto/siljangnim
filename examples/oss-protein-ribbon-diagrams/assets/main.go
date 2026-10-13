package main

import (
	"encoding/json"
	"github.com/fogleman/ribbon/pdb"
	"github.com/fogleman/ribbon/ribbon"
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
	file, err := os.Open(os.Args[2])
	if err != nil {
		panic(err)
	}
	defer file.Close()
	model, err := pdb.NewReader(file).Read()
	if err != nil {
		panic(err)
	}
	mesh := ribbon.RibbonMesh(model)
	mesh.BiUnitCube()
	if len(mesh.Triangles) < 100 {
		panic("missing ribbon surface")
	}
	vertices := [][3]float64{}
	faces := [][3]int{}
	lookup := map[[3]float64]int{}
	for _, t := range mesh.Triangles {
		face := [3]int{}
		for j, p := range [][3]float64{{t.V1.Position.X, t.V1.Position.Y, t.V1.Position.Z}, {t.V2.Position.X, t.V2.Position.Y, t.V2.Position.Z}, {t.V3.Position.X, t.V3.Position.Y, t.V3.Position.Z}} {
			id, found := lookup[p]
			if !found {
				id = len(vertices)
				lookup[p] = id
				vertices = append(vertices, p)
			}
			face[j] = id
		}
		faces = append(faces, face)
	}
	save(map[string]interface{}{"frames": []interface{}{map[string]interface{}{"mesh": map[string]interface{}{"vertices": vertices, "faces": faces}}}})
}
