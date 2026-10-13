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
#include "QuickHull.hpp"
int main(){std::cout<<"{\"frames\":[";bool first=true;for(int n:{20,50,120}){if(!first)std::cout<<",";first=false;std::vector<quickhull::Vector3<double>>p;for(int i=0;i<n;i++){double y=1-2*(i+.5)/n,a=i*2.39996323,r=sqrt(1-y*y)*(.7+.15*sin(i*4.1));p.push_back({r*cos(a),.75*y,r*sin(a)});}quickhull::QuickHull<double>q;auto h=q.getConvexHull(p,true,false);auto v=h.getVertexBuffer();auto f=h.getIndexBuffer();assert(f.size()>=12&&f.size()%3==0);Path verts;for(auto a:v)verts.push_back({a.x,a.y,a.z});std::vector<std::array<int,3>>faces;for(size_t i=0;i<f.size();i+=3)faces.push_back({int(f[i]),int(f[i+1]),int(f[i+2])});mesh(verts,faces);}std::cout<<"]}";}
