#include <cmath>
#include <cassert>
#include <fstream>
#include <filesystem>
#include "solver.h"
int main(int argc,char**argv){assert(argc==2);std::filesystem::create_directories(argv[1]);std::ofstream o(std::string(argv[1])+"/result.json");o<<"{\"frames\":[";float ratios[]={.35,1,2};for(int k=0;k<3;k++){if(k)o<<",";float x=0,v=0;float peak=0;o<<"{\"paths\":[{\"points\":[";for(int j=0;j<=480;j++){if(j)o<<",";if(j)spring_damper_exact_ratio(x,v,1,0,ratios[k],.18,1.f/120);assert(std::isfinite(x)&&std::isfinite(v));peak=max(peak,x);o<<"["<<-.8+1.6*j/480<<","<<-.5+x*.8<<",0]";}assert(std::abs(x-1)<.02);if(k==0)assert(peak>1.1);o<<"]},{\"points\":[[-0.8,0.3,0],[0.8,0.3,0]],\"color\":\"#466f81\"}],\"ratio\":"<<ratios[k]<<",\"peak\":"<<peak<<"}";}o<<"]}";}
