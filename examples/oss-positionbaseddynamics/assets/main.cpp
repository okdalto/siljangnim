#include "PositionBasedDynamics/PositionBasedDynamics.h"
#include <vector>
#include <array>
#include <fstream>
#include <cassert>
#include <cmath>
using namespace PBD;
struct Edge{int a,b;float rest;};
int main(int argc,char**argv){assert(argc==2);std::ofstream out(std::string(argv[1])+"/result.json");assert(out);out<<"{\"frames\":[";int frame=0;for(float stiffness:{.15f,.5f,1.f}){const int nx=13,ny=9;std::vector<Vector3r> p,v(nx*ny,Vector3r::Zero());for(int j=0;j<ny;j++)for(int i=0;i<nx;i++)p.emplace_back(-.9f+1.8f*i/(nx-1),.6f,.9f*j/(ny-1)-.45f);const auto initial=p;std::vector<float> mass(nx*ny,1);mass[0]=mass[nx-1]=0;std::vector<Edge> edges;auto edge=[&](int a,int b){edges.push_back({a,b,(p[a]-p[b]).norm()});};for(int j=0;j<ny;j++)for(int i=0;i<nx;i++){int a=j*nx+i;if(i+1<nx)edge(a,a+1);if(j+1<ny)edge(a,a+nx);if(i+1<nx&&j+1<ny){edge(a,a+nx+1);edge(a+1,a+nx);}}
const float dt=1.f/240;for(int t=0;t<240;t++){auto old=p;for(int i=0;i<nx*ny;i++)if(mass[i]){v[i]+=(Vector3r(0,-3,.7f*std::sin(t*.02f)))*dt;p[i]+=v[i]*dt;}for(int iter=0;iter<12;iter++)for(auto e:edges){Vector3r a=Vector3r::Zero(),b=a;PositionBasedDynamics::solve_DistanceConstraint(p[e.a],mass[e.a],p[e.b],mass[e.b],e.rest,stiffness,a,b);p[e.a]+=a;p[e.b]+=b;}for(int i=0;i<nx*ny;i++){v[i]=(p[i]-old[i])/dt*.994f;assert(p[i].allFinite());}}
assert((p[0]-initial[0]).norm()==0&&(p[nx-1]-initial[nx-1]).norm()==0);double strain=0;for(auto e:edges)strain+=std::abs((p[e.a]-p[e.b]).norm()/e.rest-1);strain/=edges.size();assert(strain<.12);if(frame++)out<<",";out<<"{\"stiffness\":"<<stiffness<<",\"meanStrain\":"<<strain<<",\"mesh\":{\"vertices\":[";for(size_t i=0;i<p.size();i++){if(i)out<<",";out<<"["<<p[i].x()<<","<<p[i].y()<<","<<p[i].z()<<"]";}out<<"],\"faces\":[";int faces=0;for(int j=0;j<ny-1;j++)for(int i=0;i<nx-1;i++){int a=j*nx+i;if(faces++)out<<",";out<<"["<<a<<","<<a+1<<","<<a+nx+1<<"],["<<a<<","<<a+nx+1<<","<<a+nx<<"]";}out<<"]}}";}out<<"]}";}
