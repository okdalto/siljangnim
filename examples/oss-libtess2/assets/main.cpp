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
#include "tesselator.h"
int main(){std::cout<<"{\"frames\":[";for(int k=0;k<3;k++){if(k)std::cout<<",";auto t=tessNewTess(nullptr);float outer[]={-.8,-.8,.8,-.8,.8,.8,-.8,.8},inner[]={-.3,-.3,.3,-.3,.3,.3,-.3,.3},reverse[]={-.3,.3,.3,.3,.3,-.3,-.3,-.3};tessAddContour(t,2,outer,2*sizeof(float),4);tessAddContour(t,2,k==2?reverse:inner,2*sizeof(float),4);assert(tessTesselate(t,k==0?TESS_WINDING_ODD:TESS_WINDING_NONZERO,TESS_POLYGONS,3,2,nullptr));const auto*v=tessGetVertices(t);const auto*f=tessGetElements(t);std::vector<Path>lines;double area=0;for(int i=0;i<tessGetElementCount(t);i++){Path p;for(int j=0;j<3;j++){auto id=f[3*i+j];assert(id!=TESS_UNDEF);p.push_back({v[2*id],v[2*id+1],0});}area+=std::abs((p[1][0]-p[0][0])*(p[2][1]-p[0][1])-(p[2][0]-p[0][0])*(p[1][1]-p[0][1]))/2;p.push_back(p[0]);lines.push_back(p);}assert(std::abs(area-(k==1?2.56:2.20))<1e-5);paths(lines);tessDeleteTess(t);}std::cout<<"]}";}
