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
#include "trace_skeleton.cpp"
int main(){std::cout<<"{\"frames\":[";for(int k=0;k<3;k++){if(k)std::cout<<",";skeleton_tracer_t t;t.W=96;t.H=96;t.im=(unsigned char*)calloc(96*96,1);for(int y=8;y<88;y++)for(int x=8;x<88;x++){double dx=x-48,dy=y-48,r=sqrt(dx*dx+dy*dy);bool inside=k==0?(std::abs(dx)<6||std::abs(dy)<6):k==1?(r>26&&r<35):(std::abs(dx)<5&&y>40)||(std::abs(dy+std::abs(dx))<5&&y<52);t.im[y*96+x]=inside;}t.thinning_zs();auto p=t.trace_skeleton(0,0,96,96,0);std::vector<Path>lines;for(auto it=p;it;it=it->next){Path q;for(auto v=it->head;v;v=v->next){assert(v->x>=0&&v->x<96&&v->y>=0&&v->y<96);q.push_back({(v->x-48)/52.,(48-v->y)/52.,0});}if(q.size()>1)lines.push_back(q);}assert(!lines.empty());paths(lines);t.destroy_polylines(p);t.destroy_rects();free(t.im);}std::cout<<"]}";}
