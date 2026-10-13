#include "box2d/box2d.h"
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

int main(){std::cout<<"{\"frames\":[";for(int k=0;k<3;k++){if(k)std::cout<<",";auto wd=b2DefaultWorldDef();wd.gravity={0,-9.81f};auto world=b2CreateWorld(&wd);assert(b2World_IsValid(world));auto gd=b2DefaultBodyDef();gd.position={0,-.2f};auto ground=b2CreateBody(world,&gd);auto box=b2MakeBox(3,.2f);auto sd=b2DefaultShapeDef();b2CreatePolygonShape(ground,&sd,&box);auto bd=b2DefaultBodyDef();bd.type=b2_dynamicBody;bd.position={0,3};auto ball=b2CreateBody(world,&bd);sd.density=1;sd.material.restitution=k==0?0:k==1?.45f:.85f;b2Circle circle={{0,0},.2f};b2CreateCircleShape(ball,&sd,&circle);Path trail;double minimum=3;for(int i=0;i<=600;i++){auto p=b2Body_GetPosition(ball);assert(std::isfinite(p.y)&&p.y>.15&&p.y<3.1);minimum=std::min(minimum,double(p.y));trail.push_back({i/600.*1.7-.85,p.y*.48-.72,0});b2World_Step(world,1.f/120,4);}assert(minimum<.3);paths({{{-.85,-.624,0},{.85,-.624,0}},trail});b2DestroyWorld(world);}std::cout<<"]}";}
