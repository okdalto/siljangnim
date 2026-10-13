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
#include "polypartition.h"
int main(){std::cout<<"{\"frames\":[";for(int k=0;k<3;k++){if(k)std::cout<<",";TPPLPoly p;p.Init(8);double xy[8][2]={{-.8,-.7},{.8,-.7},{.8,.7},{.25,.7},{.25,-.1},{-.25,-.1},{-.25,.7},{-.8,.7}};for(int i=0;i<8;i++){p[i].x=xy[i][0];p[i].y=xy[i][1];}p.SetOrientation(TPPL_ORIENTATION_CCW);TPPLPartition part;TPPLPolyList result;int ok=k==0?part.Triangulate_EC(&p,&result):k==1?part.Triangulate_OPT(&p,&result):part.ConvexPartition_OPT(&p,&result);assert(ok&&result.size()>1);std::vector<Path>lines;double area=0;for(auto poly:result){Path line;for(int i=0;i<poly.GetNumPoints();i++){auto a=poly[i],b=poly[(i+1)%poly.GetNumPoints()];area+=(a.x*b.y-b.x*a.y)/2;line.push_back({a.x,a.y,0});}line.push_back(line[0]);lines.push_back(line);}assert(std::abs(area-1.84)<1e-6);paths(lines);}std::cout<<"]}";}
