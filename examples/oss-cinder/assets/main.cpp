#include "cinder/app/App.h"
#include "cinder/app/RendererGl.h"
#include "cinder/gl/gl.h"
#include "cinder/Perlin.h"
#include "cinder/ImageIo.h"
#include <fstream>
#include <cmath>
using namespace ci;
using namespace ci::app;
class NativeFlow : public App {
 public:
 void setup() override {
  getWindow()->hide();
  const char* folder=std::getenv("OUTPUT_DIR");if(!folder)throw std::runtime_error("OUTPUT_DIR is required");
  Perlin noise(4,17);auto fbo=gl::Fbo::create(512,512,gl::Fbo::Format().samples(4));
  std::ofstream meta(std::string(folder)+"/result.json");meta<<"{\"frames\":[";
  for(int frame=0;frame<3;++frame){
   gl::ScopedFramebuffer target(fbo);gl::ScopedViewport viewport(ivec2(0),ivec2(512));gl::setMatricesWindow(512,512);gl::clear(Color(.035f,.06f,.10f));gl::enableAlphaBlending();gl::lineWidth(1.0f);
   float phase=frame*.65f;int finiteCount=0;
   for(int j=0;j<28;++j)for(int i=0;i<28;++i){
    vec2 p(24+i*17,24+j*17);float hue=.43f+.17f*float(i+j)/54.f;gl::color(ColorA(Color(CM_HSV,hue,.55f,.95f),.62f));gl::begin(GL_LINE_STRIP);
    for(int k=0;k<64;++k){
     gl::vertex(p);auto grad=noise.dfBm(vec3(p*.008f,phase));vec2 v(-grad.y,grad.x);float length=glm::length(v);if(length>1e-6f)p+=v/length*1.6f;
     if(!std::isfinite(p.x)||!std::isfinite(p.y))throw std::runtime_error("Nonfinite flow point");++finiteCount;
    }gl::end();
   }
   if(auto error=glGetError();error!=GL_NO_ERROR)throw std::runtime_error("Native OpenGL error "+std::to_string(error));
   writeImage(fs::path(std::string(folder)+"/render-"+std::to_string(frame)+".png"),fbo->readPixels8u(Area(0,0,512,512)));
   if(frame)meta<<",";meta<<"{\"phase\":"<<phase<<",\"paths\":784,\"vertices\":"<<finiteCount<<"}";
  }
  meta<<"]}";meta.close();quit();
 }
};
CINDER_APP(NativeFlow,RendererGl,[](App::Settings* s){s->setWindowSize(64,64);s->setHighDensityDisplayEnabled(false);})
