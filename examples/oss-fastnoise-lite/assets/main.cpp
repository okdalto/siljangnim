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
#include "FastNoiseLite.h"
int main(){std::cout<<"{\"frames\":[";for(int k=0;k<3;k++){if(k)std::cout<<",";FastNoiseLite noise(42);noise.SetFrequency(.07f);noise.SetNoiseType(k==1?FastNoiseLite::NoiseType_Cellular:FastNoiseLite::NoiseType_OpenSimplex2);if(k==2){noise.SetFractalType(FastNoiseLite::FractalType_FBm);noise.SetFractalOctaves(5);}Path v;std::vector<std::array<int,3>>f;int n=41;for(int y=0;y<n;y++)for(int x=0;x<n;x++){double z=noise.GetNoise(float(x),float(y));assert(std::isfinite(z));v.push_back({x*1.6/(n-1)-.8,z*.3,y*1.6/(n-1)-.8});if(x&&y){int a=y*n+x;f.push_back({a,a-1,a-n});f.push_back({a-1,a-n-1,a-n});}}mesh(v,f);}std::cout<<"]}";}
