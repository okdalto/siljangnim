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
#include <libmorton/morton.h>
int main(){std::cout<<"{\"frames\":[";bool first=true;for(int n:{4,8,16}){if(!first)std::cout<<",";first=false;std::vector<std::pair<uint_fast32_t,P>>ordered;for(int y=0;y<n;y++)for(int x=0;x<n;x++){auto key=libmorton::morton2D_32_encode(x,y);uint_fast16_t a,b;libmorton::morton2D_32_decode(key,a,b);assert(a==x&&b==y);ordered.push_back({key,{x*1.6/(n-1)-.8,y*1.6/(n-1)-.8,0}});}std::sort(ordered.begin(),ordered.end());Path p;for(auto v:ordered)p.push_back(v.second);paths({p});}std::cout<<"]}";}
