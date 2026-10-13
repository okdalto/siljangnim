#include <routingkit/dijkstra.h>
#include <fstream>
#include <filesystem>
#include <cassert>
#include <cmath>
using namespace RoutingKit;
void point(std::ostream&o,unsigned id){o<<"["<<-.8+(id%12)*1.6/11<<","<<-.6+(id/12)*1.2/7<<",0]";}
int main(int argc,char**argv){assert(argc==2);std::filesystem::create_directories(argv[1]);std::ofstream o(std::string(argv[1])+"/result.json");o<<"{\"frames\":[";int gaps[]={1,4,6};for(int k=0;k<3;k++){if(k)o<<",";std::vector<unsigned>first{0},tail,head;int gap=gaps[k];for(int id=0;id<96;id++){int x=id%12,y=id/12;for(int n:{id-1,id+1,id-12,id+12}){if(n<0||n>=96||std::abs(n%12-x)+std::abs(n/12-y)!=1)continue;if(((x==5&&n%12==6)||(x==6&&n%12==5))&&y!=gap)continue;tail.push_back(id);head.push_back(n);}first.push_back(head.size());}Dijkstra d(first,tail,head);unsigned source=36,target=47;d.add_source(source);while(!d.is_finished())d.settle([](unsigned,unsigned){return 1u;});auto p=d.get_node_path_to(target);assert(p.front()==source&&p.back()==target);assert(d.get_distance_to(target)==11+2*std::abs(gap-3));assert(p.size()==d.get_distance_to(target)+1);o<<"{\"paths\":[";for(unsigned a=0;a<head.size();a++){if(a)o<<",";o<<"{\"color\":\"#294559\",\"points\":[";point(o,tail[a]);o<<",";point(o,head[a]);o<<"]}";}o<<",{\"color\":\"#ffbc78\",\"points\":[";for(unsigned j=0;j<p.size();j++){if(j)o<<",";point(o,p[j]);}o<<"]}],\"points\":[";point(o,source);o<<",";point(o,target);o<<"],\"radius\":0.03,\"distance\":"<<d.get_distance_to(target)<<",\"gapRow\":"<<gap<<"}";}o<<"]}";}
