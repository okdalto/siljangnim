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
#include "RVO.h"
int main(){std::cout<<"{\"frames\":[";RVO::RVOSimulator sim;sim.setTimeStep(.05f);sim.setAgentDefaults(3.f,12,2.f,2.f,.12f,.6f);std::vector<RVO::Vector2> goals;std::vector<Path> trails(12);for(int i=0;i<12;i++){double a=i*6.283185307/12;RVO::Vector2 p(2*cos(a),2*sin(a));sim.addAgent(p);goals.push_back(-p);}bool first=true;for(int step=0;step<320;step++){for(int i=0;i<12;i++){auto p=sim.getAgentPosition(i);auto d=goals[i]-p;float len=std::sqrt(RVO::absSq(d));RVO::Vector2 pref=len>.6f?RVO::normalize(d)*.6f:d;if(len>.25f)pref+=RVO::Vector2(-d.y(),d.x())*(.06f/len);sim.setAgentPrefVelocity(i,pref);trails[i].push_back({p.x()*.38,p.y()*.38,0});for(int j=0;j<i;j++)assert(RVO::absSq(p-sim.getAgentPosition(j))>.23*.23);}sim.doStep();if(step==39||step==159||step==319){if(!first)std::cout<<",";first=false;paths(trails);}}std::cout<<"]}";}
