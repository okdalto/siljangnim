#include "tpe_energy_sc.h"
#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <stdexcept>
using namespace LWS;
int main(int argc,char**argv){
 if(argc!=2)return 2;
 const int n=64;std::vector<Vector3> points;std::vector<std::array<size_t,2>> edges;
 for(int i=0;i<n;i++){double t=2*acos(-1.)*i/n,r=2+.65*cos(3*t);points.push_back({r*cos(2*t)+.2*cos(11*t),r*sin(2*t),.65*sin(3*t)+.15*sin(7*t)});edges.push_back({size_t(i),size_t((i+1)%n)});}
 PolyCurveNetwork curve(points,edges);double length=curve.TotalLength();auto energy=[&](){return TPESC::tpe_total(&curve,2,4);};double initial=energy();
 Eigen::MatrixXd analytic(n,3);TPESC::FillGradientVectorDirect(&curve,analytic,2,4);double gradientError=0;
 for(int i: {0,13,41})for(int axis=0;axis<3;axis++){double saved=curve.positions(i,axis),h=1e-6;curve.positions(i,axis)=saved+h;double plus=energy();curve.positions(i,axis)=saved-h;double minus=energy();curve.positions(i,axis)=saved;double finite=(plus-minus)/(2*h);gradientError=std::max(gradientError,std::abs(analytic(i,axis)-finite)/(1+std::abs(finite)));}
 if(gradientError>1e-5)throw std::runtime_error("Original analytic gradient disagrees with finite differences");
 std::cout<<"Gradient check "<<gradientError<<std::endl;

 std::ofstream out(argv[1]);out<<std::setprecision(17)<<"{\"engine\":\"Repulsive Curves original TPESC\",\"frames\":[";int frames=0;
 auto record=[&](int step){if(frames++)out<<",";out<<"{\"step\":"<<step<<",\"energy\":"<<energy()<<",\"length\":"<<curve.TotalLength()<<",\"points\":[";for(int i=0;i<n;i++){if(i)out<<",";out<<"["<<curve.positions(i,0)<<","<<curve.positions(i,1)<<","<<curve.positions(i,2)<<"]";}out<<"]}";};
 record(0);
 for(int step=1;step<=100;step++){
  Eigen::MatrixXd gradient(n,3);TPESC::FillGradientVectorDirect(&curve,gradient,2,4);if(!gradient.allFinite())throw std::runtime_error("Non-finite original gradient");
  Eigen::MatrixXd before=curve.positions;double e=energy(),rate=.02;bool accepted=false;
  for(int trial=0;trial<24;trial++){
   curve.positions=before-rate*gradient;Eigen::RowVector3d center=curve.positions.colwise().mean();curve.positions.rowwise()-=center;curve.positions*=length/curve.TotalLength();
   double next=energy();if(std::isfinite(next)&&next<e){accepted=true;break;}rate*=.5;
  }
  if(!accepted)curve.positions=before;
  if(step==25||step==100)record(step);
  std::cout<<step<<" "<<energy()<<std::endl;
 }
 if(!(energy()<initial*.9))throw std::runtime_error("Insufficient energy reduction");out<<"],\"alpha\":2,\"beta\":4,\"gradientCheckMaxRelativeError\":"<<gradientError<<",\"vertices\":"<<n<<"}\n";
}
