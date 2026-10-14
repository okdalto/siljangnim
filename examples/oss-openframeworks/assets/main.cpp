#include "ofMain.h"
#include <filesystem>
class Gallery: public ofBaseApp {
public:
 std::string output;
 explicit Gallery(std::string path):output(std::move(path)){}
 void setup() override {
  ofSetLogLevel(OF_LOG_WARNING);ofDisableArbTex();ofSeedRandom(17);
  ofFbo fbo;fbo.allocate(640,480,GL_RGBA);ofJson results;results["engine"]="openFrameworks 0.12.1";results["frames"]=ofJson::array();
  for(int frame=0;frame<3;frame++) {
   const float phase=frame*.65f;ofMesh mesh;mesh.setMode(OF_PRIMITIVE_TRIANGLES);const int n=48;
   for(int y=0;y<=n;y++)for(int x=0;x<=n;x++) {
    float h=ofNoise(x*.075f,y*.075f,phase)*95.f;
    mesh.addVertex({(x-n*.5f)*8.f,(y-n*.5f)*8.f,h});mesh.addColor(ofFloatColor(.15f+h/150.f,.45f+h/240.f,.62f+h/340.f));
   }
   for(int y=0;y<n;y++)for(int x=0;x<n;x++){int a=y*(n+1)+x,b=a+1,c=a+n+1,d=c+1;mesh.addTriangle(a,b,c);mesh.addTriangle(b,d,c);}
   fbo.begin();ofClear(10,20,32,255);ofEnableDepthTest();ofPushMatrix();ofTranslate(320,235,0);ofScale(.72f,.72f,.72f);ofRotateXDeg(53);ofRotateZDeg(-28);ofTranslate(0,0,-45);mesh.draw();ofPopMatrix();ofDisableDepthTest();
   ofSetColor(215,230,240);ofDrawBitmapString("openFrameworks / original noise, mesh and OpenGL",20,28);ofDrawBitmapString("Phase "+ofToString(phase,2)+" | 2401 vertices | 4608 triangles",20,455);fbo.end();
   ofPixels pixels;fbo.readToPixels(pixels);ofSaveImage(pixels,output+"/render-"+ofToString(frame)+".png");
   ofJson entry;entry["phase"]=phase;entry["vertices"]=mesh.getNumVertices();entry["triangles"]=mesh.getNumIndices()/3;entry["heights"]=ofJson::array();for(auto v:mesh.getVertices()){if(!std::isfinite(v.z))throw std::runtime_error("Nonfinite original noise");entry["heights"].push_back(v.z);}results["frames"].push_back(entry);
  }
  ofSavePrettyJson(output+"/result.json",results);ofExit(0);
 }
};
int main(int argc,char** argv){if(argc!=2)return 2;std::filesystem::create_directories(argv[1]);ofGLFWWindowSettings settings;settings.setSize(640,480);settings.setGLVersion(3,2);settings.visible=false;settings.resizable=false;auto window=ofCreateWindow(settings);ofRunApp(window,std::make_shared<Gallery>(std::filesystem::absolute(argv[1]).string()));ofRunMainLoop();}
