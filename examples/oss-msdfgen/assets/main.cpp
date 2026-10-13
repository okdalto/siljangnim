#include <iostream>
#include <vector>
#include <array>
#include <algorithm>
#include <cmath>
#include <cassert>
#include <cstdint>
using P=std::array<double,3>;using Path=std::vector<P>;
void point(P p){std::cout<<"["<<p[0]<<","<<p[1]<<","<<p[2]<<"]";}
void paths(const std::vector<Path>&lines){std::cout<<"{\"paths\":[";bool first=true;for(auto line:lines){if(!first)std::cout<<",";first=false;std::cout<<"{\"points\":[";for(size_t i=0;i<line.size();i++){if(i)std::cout<<",";point(line[i]);}std::cout<<"]}";}std::cout<<"]}";}
void mesh(const Path&v,const std::vector<std::array<int,3>>&f){std::cout<<"{\"mesh\":{\"vertices\":[";for(size_t i=0;i<v.size();i++){if(i)std::cout<<",";point(v[i]);}std::cout<<"],\"faces\":[";for(size_t i=0;i<f.size();i++){if(i)std::cout<<",";std::cout<<"["<<f[i][0]<<","<<f[i][1]<<","<<f[i][2]<<"]";}std::cout<<"]}}";}
void audio(const std::vector<double>&samples){double energy=0;for(auto v:samples){assert(std::isfinite(v));energy+=v*v;}assert(energy/samples.size()>1e-6);std::cout<<"{\"samples\":[";for(size_t i=0;i<samples.size();i++){if(i)std::cout<<",";std::cout<<samples[i];}std::cout<<"],\"paths\":[{\"points\":[";for(int i=0;i<800;i++){if(i)std::cout<<",";point({i*1.6/799-.8,samples[22050+i]*.7,0});}std::cout<<"]}]}";}
#include "msdfgen.h"
int main(){std::cout<<"{\"frames\":[";using namespace msdfgen;for(int n:{32,48,64}){if(n!=32)std::cout<<",";Shape shape;auto&c=shape.addContour();Vector2 p[]={{.15,.15},{.85,.15},{.85,.4},{.45,.4},{.45,.85},{.15,.85}};for(int i=0;i<6;i++)c.addEdge(EdgeHolder(p[i],p[(i+1)%6]));shape.normalize();shape.orientContours();edgeColoringSimple(shape,3.0);Bitmap<float,3> field(n,n);SDFTransformation transform(Projection(double(n),Vector2(0,0)),Range(4./n));generateMSDF(field,shape,transform);std::cout<<"{\"radius\":"<<.9/n<<",\"points\":[";int count=0;for(int y=0;y<n;y++)for(int x=0;x<n;x++){auto a=field(x,y);assert(std::isfinite(a[0]+a[1]+a[2]));float m=std::max(std::min(a[0],a[1]),std::min(std::max(a[0],a[1]),a[2]));if(m>.5){if(count++)std::cout<<",";point({(x+.5)/n*1.6-.8,(y+.5)/n*1.6-.8,0});}}assert(count>n*n*.2&&count<n*n*.6);std::cout<<"]}";}std::cout<<"]}";}
