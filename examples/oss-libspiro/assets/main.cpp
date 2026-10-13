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
#include "spiroentrypoints.h"
Path curve;
void move(bezctx*,double x,double y,int){curve.push_back({x,y,0});}
void line(bezctx*,double x,double y){curve.push_back({x,y,0});}
void quad(bezctx*,double x1,double y1,double x2,double y2){auto a=curve.back();for(int i=1;i<=20;i++){double t=i/20.,v=1-t;curve.push_back({v*v*a[0]+2*v*t*x1+t*t*x2,v*v*a[1]+2*v*t*y1+t*t*y2,0});}}
void cubic(bezctx*,double x1,double y1,double x2,double y2,double x3,double y3){auto a=curve.back();for(int i=1;i<=20;i++){double t=i/20.,v=1-t;curve.push_back({v*v*v*a[0]+3*v*v*t*x1+3*v*t*t*x2+t*t*t*x3,v*v*v*a[1]+3*v*v*t*y1+3*v*t*t*y2+t*t*t*y3,0});}}
void mark(bezctx*,int){}

int main(){std::cout<<"{\"frames\":[";for(int k=0;k<3;k++){if(k)std::cout<<",";char ty=k==0?SPIRO_CORNER:k==1?SPIRO_G2:SPIRO_G4;spiro_cp p[]={{-.75,0,ty},{-.3,.55,ty},{.3,.45,ty},{.75,-.2,ty},{.1,-.65,ty}};bezctx b={move,line,quad,cubic,mark};curve.clear();assert(SpiroCPsToBezier2(p,5,0,1,&b));assert(curve.size()>=5);for(auto a:curve)assert(std::isfinite(a[0]+a[1]));paths({curve});}std::cout<<"]}";}
