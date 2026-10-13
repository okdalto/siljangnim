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
#include "voro++.hh"
int main(){std::cout<<"{\"frames\":[";for(int n:{8,24,80}){if(n!=8)std::cout<<",";voro::voronoicell cell;cell.init(-.8,.8,-.8,.8,-.8,.8);for(int i=0;i<n;i++){double y=1-2*(i+.5)/n,a=i*2.39996323,r=sqrt(1-y*y);assert(cell.plane(r*cos(a),y,r*sin(a),1.2));}assert(cell.volume()>0&&cell.volume()<4.096);std::vector<double>vs;std::vector<int>fs;cell.vertices(vs);cell.face_vertices(fs);Path v;for(size_t i=0;i<vs.size();i+=3)v.push_back({vs[i],vs[i+1],vs[i+2]});std::vector<std::array<int,3>>f;for(size_t i=0;i<fs.size();){int count=fs[i++];for(int j=1;j<count-1;j++)f.push_back({fs[i],fs[i+j],fs[i+j+1]});i+=count;}mesh(v,f);}std::cout<<"]}";}
