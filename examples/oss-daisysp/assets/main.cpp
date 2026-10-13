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
void audio(const std::vector<double>&samples){double energy=0;for(auto v:samples){assert(std::isfinite(v));energy+=v*v;}assert(energy/samples.size()>1e-6);std::cout<<"{\"samples\":[";for(size_t i=0;i<samples.size();i++){if(i)std::cout<<",";std::cout<<samples[i];}std::cout<<"],\"paths\":[{\"points\":[";for(int i=0;i<800;i++){if(i)std::cout<<",";point({i*1.6/799-.8,samples[22050+i]*.7,0});}std::cout<<"]}]}";}
#include "Synthesis/oscillator.h"
int main(){std::cout<<"{\"frames\":[";for(int k=0;k<3;k++){if(k)std::cout<<",";daisysp::Oscillator osc;osc.Init(44100);osc.SetFreq(220);osc.SetAmp(.65);osc.SetWaveform(k==0?daisysp::Oscillator::WAVE_SIN:k==1?daisysp::Oscillator::WAVE_TRI:daisysp::Oscillator::WAVE_POLYBLEP_SAW);std::vector<double>s(44100);for(auto&v:s)v=osc.Process();audio(s);}std::cout<<"]}";}
