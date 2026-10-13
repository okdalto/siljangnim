#include "Galaxy.hpp"
#include "Helper.hpp"
#include <fstream>
#include <iomanip>
#include <cstdlib>
#include <cmath>
int main(int argc,char**argv){
 if(argc!=2)return 2;
 std::ofstream out(argv[1]);out<<std::setprecision(9)<<"{\"frames\":[";
 for(int mode=0;mode<3;++mode){
  std::srand(17);Galaxy galaxy;Galaxy::GalaxyParam p{};
  p.rad=13000;p.radCore=4000;p.deltaAng=mode==0?0.00015f:(mode==1?0.0004f:0.00065f);
  p.ex1=.75;p.ex2=.95;p.numStars=12000;p.numDust=0;p.numH2=0;p.hasDarkMatter=true;p.pertN=0;p.pertAmp=0;p.dustRenderSize=70;p.baseTemp=4500;
  galaxy.Reset(p);const auto&stars=galaxy.GetStars();if(stars.size()!=12000)return 3;
  if(mode)out<<",";out<<"{\"angularOffset\":"<<p.deltaAng<<",\"stars\":[";
  for(size_t i=0;i<stars.size();++i){const auto&s=stars[i];if(!(std::isfinite(s.a)&&std::isfinite(s.b)&&std::isfinite(s.velTheta)&&s.a>0))return 4;
   if(i)out<<",";out<<"["<<s.a<<","<<s.b<<","<<s.theta0<<","<<s.velTheta<<","<<s.tiltAngle<<","<<s.temp<<","<<s.mag<<"]";
  }out<<"],\"points\":[";
  // Project the native orbital elements into a fixed face-on view at time zero.
  for(size_t i=0;i<stars.size();++i){const auto&s=stars[i];const double alpha=s.theta0*Helper::DEG_TO_RAD,beta=-s.tiltAngle;
   if(i)out<<",";out<<"["<<(s.a*cos(alpha)*cos(beta)-s.b*sin(alpha)*sin(beta))/26000<<","<<(s.a*cos(alpha)*sin(beta)+s.b*sin(alpha)*cos(beta))/26000<<"]";
  }out<<"],\"values\":[";
  for(size_t i=0;i<stars.size();++i){if(i)out<<",";out<<std::clamp((stars[i].temp-1000)/9000.0f,0.0f,1.0f);}
  out<<"],\"radius\":0.003,\"rotationCurve\":[";
  for(int r=500;r<=20000;r+=500){if(r>500)out<<",";out<<"["<<r<<","<<Helper::VelocityWithDarkMatter(r)<<","<<Helper::VelocityWithoutDarkMatter(r)<<"]";}
  out<<"]}";
 }out<<"]}";return out.good()?0:5;
}
