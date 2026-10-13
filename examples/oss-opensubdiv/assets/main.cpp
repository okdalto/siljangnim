#define main opensubdiv_upstream_tutorial
#include "tutorials/far/tutorial_1_1/far_tutorial_1_1.cpp"
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

int main(){std::cout<<"{\"frames\":[";for(int depth=1;depth<=3;depth++){if(depth>1)std::cout<<",";Far::TopologyDescriptor desc;desc.numVertices=g_nverts;desc.numFaces=g_nfaces;desc.numVertsPerFace=g_vertsperface;desc.vertIndicesPerFace=g_vertIndices;auto ref=Far::TopologyRefinerFactory<Far::TopologyDescriptor>::Create(desc,Far::TopologyRefinerFactory<Far::TopologyDescriptor>::Options(Sdc::SCHEME_CATMARK));assert(ref);ref->RefineUniform(Far::TopologyRefiner::UniformOptions(depth));std::vector<Vertex> buffer(ref->GetNumVerticesTotal());for(int i=0;i<g_nverts;i++)buffer[i].SetPosition(g_verts[i][0]*1.6,g_verts[i][1]*1.6,g_verts[i][2]*1.6);Far::PrimvarRefiner interpolation(*ref);auto src=buffer.data();for(int level=1;level<=depth;level++){auto dst=src+ref->GetLevel(level-1).GetNumVertices();interpolation.Interpolate(level,src,dst);src=dst;}const auto&level=ref->GetLevel(depth);Path verts;for(int i=0;i<level.GetNumVertices();i++){auto p=src[i].GetPosition();assert(std::isfinite(p[0]+p[1]+p[2]));verts.push_back({p[0],p[1],p[2]});}std::vector<std::array<int,3>>faces;for(int i=0;i<level.GetNumFaces();i++){auto f=level.GetFaceVertices(i);assert(f.size()==4);faces.push_back({f[0],f[1],f[2]});faces.push_back({f[0],f[2],f[3]});}assert(level.GetNumFaces()==6*int(std::pow(4,depth)));mesh(verts,faces);delete ref;}std::cout<<"]}";}
