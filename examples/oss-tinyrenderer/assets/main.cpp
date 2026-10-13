#include "our_gl.h"
#include <cassert>
#include <cmath>
#include <filesystem>
#include <fstream>
extern mat<4,4> ModelView, Perspective;
extern std::vector<double> zbuffer;
struct Shader : IShader {
    TGAColor color;
    std::pair<bool,TGAColor> fragment(const vec3 bar) const override { return {false,color}; }
};
int main(int argc,char**argv){
 assert(argc==2);std::filesystem::create_directories(argv[1]);
 const vec3 vertices[]={{-.55,-.55,-.55},{.55,-.55,-.55},{.55,.55,-.55},{-.55,.55,-.55},{-.55,-.55,.55},{.55,-.55,.55},{.55,.55,.55},{-.55,.55,.55}};
 const int faces[][3]={{0,2,1},{0,3,2},{4,5,6},{4,6,7},{0,1,5},{0,5,4},{3,7,6},{3,6,2},{0,4,7},{0,7,3},{1,2,6},{1,6,5}};
 for(int k=0;k<3;k++){
  const double angle=.3+k*.6;vec3 eye{2*std::sin(angle),1.15,2*std::cos(angle)};
  lookat(eye,{0,0,0},{0,1,0});init_perspective(norm(eye));init_viewport(32,32,320,320);init_zbuffer(384,384);
  TGAImage image(384,384,TGAImage::RGB,{37,22,11,255});Shader shader;
  for(int f=0;f<12;f++){
   auto a=vertices[faces[f][0]],b=vertices[faces[f][1]],c=vertices[faces[f][2]];double lit=.35+.65*std::max(0.,normalized(cross(b-a,c-a))*normalized(vec3{-1,2,3}));
   const int colors[3][3]={{87,216,198},{255,188,120},{173,155,255}};const auto &col=colors[(f/2)%3];shader.color={{(uint8_t)(col[2]*lit),(uint8_t)(col[1]*lit),(uint8_t)(col[0]*lit),255}};
   Triangle tri;for(int i=0;i<3;i++){auto v=vertices[faces[f][i]];tri[i]=Perspective*ModelView*vec4{v.x,v.y,v.z,1};}rasterize(tri,shader,image);
  }
  int covered=0;for(double z:zbuffer){assert(std::isfinite(z));if(z>-999)covered++;}assert(covered>10000);
  std::ofstream o(std::string(argv[1])+"/render-"+std::to_string(k)+".ppm",std::ios::binary);o<<"P6\n384 384\n255\n";
  for(int y=383;y>=0;y--)for(int x=0;x<384;x++){auto c=image.get(x,y);char rgb[]={(char)c[2],(char)c[1],(char)c[0]};o.write(rgb,3);}
 }
 std::ofstream(std::string(argv[1])+"/result.json")<<"{\"frames\":[{\"angle\":0.3},{\"angle\":0.9},{\"angle\":1.5}]}";
}
