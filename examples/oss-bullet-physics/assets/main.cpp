#include "btBulletDynamicsCommon.h"
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

int main(){std::cout<<"{\"frames\":[";for(int k=0;k<3;k++){if(k)std::cout<<",";btDefaultCollisionConfiguration config;btCollisionDispatcher dispatcher(&config);btDbvtBroadphase broad;btSequentialImpulseConstraintSolver solver;btDiscreteDynamicsWorld world(&dispatcher,&broad,&solver,&config);world.setGravity(btVector3(0,-9.81,0));btStaticPlaneShape floorShape(btVector3(0,1,0),0);btSphereShape sphere(.2);btTransform identity;identity.setIdentity();btDefaultMotionState floorMotion(identity);btRigidBody::btRigidBodyConstructionInfo fi(0,&floorMotion,&floorShape);btRigidBody floor(fi);floor.setRestitution(1);world.addRigidBody(&floor);btTransform start=identity;start.setOrigin(btVector3(0,3,0));btDefaultMotionState motion(start);btVector3 inertia;sphere.calculateLocalInertia(1,inertia);btRigidBody::btRigidBodyConstructionInfo bi(1,&motion,&sphere,inertia);btRigidBody ball(bi);ball.setRestitution(k==0?0:k==1?.45:.85);world.addRigidBody(&ball);Path trail;double minimum=3;for(int i=0;i<=600;i++){double y=ball.getWorldTransform().getOrigin().y();assert(std::isfinite(y)&&y>.13&&y<3.1);minimum=std::min(minimum,y);trail.push_back({i/600.*1.7-.85,y*.48-.72,0});world.stepSimulation(1.f/120,0);}assert(minimum<.3);paths({{{-.85,-.624,0},{.85,-.624,0}},trail});world.removeRigidBody(&ball);world.removeRigidBody(&floor);}std::cout<<"]}";}
