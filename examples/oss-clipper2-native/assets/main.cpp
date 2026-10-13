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
#include "clipper2/clipper.h"
int main(){std::cout<<"{\"frames\":[";using Clipper2Lib::PathsD;using Clipper2Lib::FillRule;using Clipper2Lib::Union;using Clipper2Lib::Intersect;using Clipper2Lib::Difference;using Clipper2Lib::Area;PathsD a={{{-.8,-.6},{.35,-.6},{.35,.65},{-.8,.65}}},b={{{-.25,-.8},{.85,-.8},{.85,.3},{-.25,.3}}};for(int k=0;k<3;k++){if(k)std::cout<<",";auto result=k==0?Union(a,b,FillRule::NonZero,8):k==1?Intersect(a,b,FillRule::NonZero,8):Difference(a,b,FillRule::NonZero,8);assert(!result.empty());double expected=k==0?2.1075:k==1?.54:.8975;assert(std::abs(Area(result)-expected)<1e-6);std::vector<Path>lines;for(auto poly:result){Path p;for(auto v:poly)p.push_back({v.x,v.y,0});p.push_back(p[0]);lines.push_back(p);}paths(lines);}std::cout<<"]}";}
