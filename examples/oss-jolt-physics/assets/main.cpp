#define main jolt_upstream_hello_world
#include "HelloWorld/HelloWorld.cpp"
#undef main

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

int main(){std::cout<<"{\"frames\":[";RegisterDefaultAllocator();Factory::sInstance=new Factory();RegisterTypes();for(int k=0;k<3;k++){if(k)std::cout<<",";TempAllocatorImpl allocator(10*1024*1024);JobSystemThreadPool jobs(cMaxPhysicsJobs,cMaxPhysicsBarriers,1);BPLayerInterfaceImpl layers;ObjectVsBroadPhaseLayerFilterImpl broadFilter;ObjectLayerPairFilterImpl pairFilter;PhysicsSystem world;world.Init(32,0,64,64,layers,broadFilter,pairFilter);world.SetGravity(Vec3(0,-9.81f,0));auto&b=world.GetBodyInterface();BodyCreationSettings fs(new BoxShape(Vec3(3,.2f,3)),RVec3(0,-.2f,0),Quat::sIdentity(),EMotionType::Static,Layers::NON_MOVING);auto floor=b.CreateAndAddBody(fs,EActivation::DontActivate);BodyCreationSettings bs(new SphereShape(.2f),RVec3(0,3,0),Quat::sIdentity(),EMotionType::Dynamic,Layers::MOVING);bs.mRestitution=k==0?0:k==1?.45f:.85f;bs.mLinearDamping=0;auto ball=b.CreateAndAddBody(bs,EActivation::Activate);Path trail;double minimum=3;for(int i=0;i<=600;i++){double y=b.GetCenterOfMassPosition(ball).GetY();assert(std::isfinite(y)&&y>.13&&y<3.1);minimum=std::min(minimum,y);trail.push_back({i/600.*1.7-.85,y*.48-.72,0});world.Update(1.f/120,1,&allocator,&jobs);}assert(minimum<.3);paths({{{-.85,-.624,0},{.85,-.624,0}},trail});b.RemoveBody(ball);b.DestroyBody(ball);b.RemoveBody(floor);b.DestroyBody(floor);}UnregisterTypes();delete Factory::sInstance;Factory::sInstance=nullptr;std::cout<<"]}";}
