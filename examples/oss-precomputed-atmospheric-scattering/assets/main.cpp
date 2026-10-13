/**
 * Copyright (c) 2017 Eric Bruneton
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 * 1. Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 * 2. Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 * 3. Neither the name of the copyright holders nor the names of its
 *    contributors may be used to endorse or promote products derived from
 *    this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF
 * THE POSSIBILITY OF SUCH DAMAGE.
 */

#include <OpenGL/gl3.h>
#include <GLFW/glfw3.h>
#include <cmath>
#include <fstream>
#include <iostream>
#include <memory>
#include <vector>
#include <cassert>
#include "atmosphere/model.h"
#include "atmosphere/constants.h"
using atmosphere::Model;using atmosphere::DensityProfileLayer;
std::unique_ptr<Model> earth(){
 const double kPi=3.1415926,kSunAngularRadius=.00935/2.,kLengthUnitInMeters=1000.;
 const bool use_half_precision_=true,use_constant_solar_spectrum_=false,use_ozone_=true,use_combined_textures_=false;
 const int use_luminance_=0,PRECOMPUTED=2;
 std::unique_ptr<Model> model_;
  // Values from "Reference Solar Spectral Irradiance: ASTM G-173", ETR column
  // (see http://rredc.nrel.gov/solar/spectra/am1.5/ASTMG173/ASTMG173.html),
  // summed and averaged in each bin (e.g. the value for 360nm is the average
  // of the ASTM G-173 values for all wavelengths between 360 and 370nm).
  // Values in W.m^-2 per nanometer.
  constexpr int kLambdaMin = 360;
  constexpr int kLambdaMax = 830;
  constexpr double kSolarIrradiance[48] = {
    1.11776, 1.14259, 1.01249, 1.14716, 1.72765, 1.73054, 1.6887, 1.61253,
    1.91198, 2.03474, 2.02042, 2.02212, 1.93377, 1.95809, 1.91686, 1.8298,
    1.8685, 1.8931, 1.85149, 1.8504, 1.8341, 1.8345, 1.8147, 1.78158, 1.7533,
    1.6965, 1.68194, 1.64654, 1.6048, 1.52143, 1.55622, 1.5113, 1.474, 1.4482,
    1.41018, 1.36775, 1.34188, 1.31429, 1.28303, 1.26758, 1.2367, 1.2082,
    1.18737, 1.14683, 1.12362, 1.1058, 1.07124, 1.04992
  };
  // Values from http://www.iup.uni-bremen.de/gruppen/molspec/databases/
  // referencespectra/o3spectra2011/index.html for 233K, summed and averaged in
  // each bin (e.g. the value for 360nm is the average of the original values
  // for all wavelengths between 360 and 370nm). Values in m^2.
  constexpr double kOzoneCrossSection[48] = {
    1.18e-27, 2.182e-28, 2.818e-28, 6.636e-28, 1.527e-27, 2.763e-27, 5.52e-27,
    8.451e-27, 1.582e-26, 2.316e-26, 3.669e-26, 4.924e-26, 7.752e-26, 9.016e-26,
    1.48e-25, 1.602e-25, 2.139e-25, 2.755e-25, 3.091e-25, 3.5e-25, 4.266e-25,
    4.672e-25, 4.398e-25, 4.701e-25, 5.019e-25, 4.305e-25, 3.74e-25, 3.215e-25,
    2.662e-25, 2.238e-25, 1.852e-25, 1.473e-25, 1.209e-25, 9.423e-26, 7.455e-26,
    6.566e-26, 5.105e-26, 4.15e-26, 4.228e-26, 3.237e-26, 2.451e-26, 2.801e-26,
    2.534e-26, 1.624e-26, 1.465e-26, 2.078e-26, 1.383e-26, 7.105e-27
  };
  // From https://en.wikipedia.org/wiki/Dobson_unit, in molecules.m^-2.
  constexpr double kDobsonUnit = 2.687e20;
  // Maximum number density of ozone molecules, in m^-3 (computed so at to get
  // 300 Dobson units of ozone - for this we divide 300 DU by the integral of
  // the ozone density profile defined below, which is equal to 15km).
  constexpr double kMaxOzoneNumberDensity = 300.0 * kDobsonUnit / 15000.0;
  // Wavelength independent solar irradiance "spectrum" (not physically
  // realistic, but was used in the original implementation).
  constexpr double kConstantSolarIrradiance = 1.5;
  constexpr double kBottomRadius = 6360000.0;
  constexpr double kTopRadius = 6420000.0;
  constexpr double kRayleigh = 1.24062e-6;
  constexpr double kRayleighScaleHeight = 8000.0;
  constexpr double kMieScaleHeight = 1200.0;
  constexpr double kMieAngstromAlpha = 0.0;
  constexpr double kMieAngstromBeta = 5.328e-3;
  constexpr double kMieSingleScatteringAlbedo = 0.9;
  constexpr double kMiePhaseFunctionG = 0.8;
  constexpr double kGroundAlbedo = 0.1;
  const double max_sun_zenith_angle =
      (use_half_precision_ ? 102.0 : 120.0) / 180.0 * kPi;

  DensityProfileLayer
      rayleigh_layer(0.0, 1.0, -1.0 / kRayleighScaleHeight, 0.0, 0.0);
  DensityProfileLayer mie_layer(0.0, 1.0, -1.0 / kMieScaleHeight, 0.0, 0.0);
  // Density profile increasing linearly from 0 to 1 between 10 and 25km, and
  // decreasing linearly from 1 to 0 between 25 and 40km. This is an approximate
  // profile from http://www.kln.ac.lk/science/Chemistry/Teaching_Resources/
  // Documents/Introduction%20to%20atmospheric%20chemistry.pdf (page 10).
  std::vector<DensityProfileLayer> ozone_density;
  ozone_density.push_back(
      DensityProfileLayer(25000.0, 0.0, 0.0, 1.0 / 15000.0, -2.0 / 3.0));
  ozone_density.push_back(
      DensityProfileLayer(0.0, 0.0, 0.0, -1.0 / 15000.0, 8.0 / 3.0));

  std::vector<double> wavelengths;
  std::vector<double> solar_irradiance;
  std::vector<double> rayleigh_scattering;
  std::vector<double> mie_scattering;
  std::vector<double> mie_extinction;
  std::vector<double> absorption_extinction;
  std::vector<double> ground_albedo;
  for (int l = kLambdaMin; l <= kLambdaMax; l += 10) {
    double lambda = static_cast<double>(l) * 1e-3;  // micro-meters
    double mie =
        kMieAngstromBeta / kMieScaleHeight * pow(lambda, -kMieAngstromAlpha);
    wavelengths.push_back(l);
    if (use_constant_solar_spectrum_) {
      solar_irradiance.push_back(kConstantSolarIrradiance);
    } else {
      solar_irradiance.push_back(kSolarIrradiance[(l - kLambdaMin) / 10]);
    }
    rayleigh_scattering.push_back(kRayleigh * pow(lambda, -4));
    mie_scattering.push_back(mie * kMieSingleScatteringAlbedo);
    mie_extinction.push_back(mie);
    absorption_extinction.push_back(use_ozone_ ?
        kMaxOzoneNumberDensity * kOzoneCrossSection[(l - kLambdaMin) / 10] :
        0.0);
    ground_albedo.push_back(kGroundAlbedo);
  }

  model_.reset(new Model(wavelengths, solar_irradiance, kSunAngularRadius,
      kBottomRadius, kTopRadius, {rayleigh_layer}, rayleigh_scattering,
      {mie_layer}, mie_scattering, mie_extinction, kMiePhaseFunctionG,
      ozone_density, absorption_extinction, ground_albedo, max_sun_zenith_angle,
      kLengthUnitInMeters, use_luminance_ == PRECOMPUTED ? 15 : 3,
      use_combined_textures_, use_half_precision_));
  model_->Init();
 return model_;
}
GLuint shader(GLenum type,const char*src){GLuint s=glCreateShader(type);glShaderSource(s,1,&src,nullptr);glCompileShader(s);GLint ok;glGetShaderiv(s,GL_COMPILE_STATUS,&ok);if(!ok){char log[8192];glGetShaderInfoLog(s,8192,nullptr,log);throw std::runtime_error(log);}return s;}
int main(int argc,char**argv){
 assert(argc==2);assert(glfwInit());glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR,4);glfwWindowHint(GLFW_CONTEXT_VERSION_MINOR,1);glfwWindowHint(GLFW_OPENGL_PROFILE,GLFW_OPENGL_CORE_PROFILE);glfwWindowHint(GLFW_OPENGL_FORWARD_COMPAT,GL_TRUE);glfwWindowHint(GLFW_VISIBLE,GL_FALSE);glfwWindowHint(GLFW_COCOA_RETINA_FRAMEBUFFER,GL_FALSE);
 auto window=glfwCreateWindow(512,384,"Native atmosphere",nullptr,nullptr);assert(window);glfwMakeContextCurrent(window);
 auto model=earth();
 assert(glGetError()==GL_NO_ERROR);
 const char*vs=R"glsl(#version 330
 void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0.,1.);})glsl";
 const char*fs=R"glsl(#version 330
 uniform float elevation;
 out vec4 color;
 vec3 GetSkyRadiance(vec3 camera,vec3 view_ray,float shadow_length,vec3 sun_direction,out vec3 transmittance);
 void main(){vec2 p=(gl_FragCoord.xy-vec2(256,192))/384.;vec3 ray=normalize(vec3(p.x,1.,p.y*.7+.3));vec3 trans;vec3 sky=GetSkyRadiance(vec3(0,0,6360.002),ray,0.,vec3(0,cos(elevation),sin(elevation)),trans);color=vec4(pow(vec3(1.)-exp(-sky*10.),vec3(1./2.2)),1.);})glsl";
 GLuint program=glCreateProgram();glAttachShader(program,shader(GL_VERTEX_SHADER,vs));glAttachShader(program,shader(GL_FRAGMENT_SHADER,fs));glAttachShader(program,model->shader());glLinkProgram(program);GLint ok;glGetProgramiv(program,GL_LINK_STATUS,&ok);if(!ok){char log[8192];glGetProgramInfoLog(program,8192,nullptr,log);throw std::runtime_error(log);}glUseProgram(program);model->SetProgramUniforms(program,0,1,2,3);
 std::vector<float> data(atmosphere::TRANSMITTANCE_TEXTURE_WIDTH*atmosphere::TRANSMITTANCE_TEXTURE_HEIGHT*4);glActiveTexture(GL_TEXTURE0);glGetTexImage(GL_TEXTURE_2D,0,GL_RGBA,GL_FLOAT,data.data());float lo=1,hi=0;for(size_t i=0;i<data.size();++i)if(i%4!=3){assert(std::isfinite(data[i])&&data[i]>=0&&data[i]<=1.001);lo=std::min(lo,data[i]);hi=std::max(hi,data[i]);}assert(hi>.9&&lo<.1);std::cout<<"PASS original four-order atmospheric precomputation "<<lo<<" "<<hi<<std::endl;
 assert(glGetError()==GL_NO_ERROR);
 GLuint vao;glGenVertexArrays(1,&vao);glBindVertexArray(vao);glViewport(0,0,512,384);glValidateProgram(program);glGetProgramiv(program,GL_VALIDATE_STATUS,&ok);if(!ok){char log[8192];glGetProgramInfoLog(program,8192,nullptr,log);std::cerr<<"Validate: "<<log<<std::endl;return 3;}
 for(int i=0;i<3;i++){float degrees[]={5,20,60};glUniform1f(glGetUniformLocation(program,"elevation"),degrees[i]*3.1415926/180.);glDrawArrays(GL_TRIANGLES,0,3);glFinish();std::vector<unsigned char> rgb(512*384*3);glReadPixels(0,0,512,384,GL_RGB,GL_UNSIGNED_BYTE,rgb.data());{auto e=glGetError();if(e!=GL_NO_ERROR){std::cerr<<"Render GL status "<<e<<std::endl;return 2;}}std::ofstream f(std::string(argv[1])+"/render-"+std::to_string(i)+".ppm",std::ios::binary);f<<"P6\n512 384\n255\n";for(int y=383;y>=0;y--)f.write((char*)rgb.data()+y*512*3,512*3);}
 model.reset();glfwDestroyWindow(window);glfwTerminate();
}
