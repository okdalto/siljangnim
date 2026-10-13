#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include <assert.h>
#include "aubio.h"
#include "pitch/pitchyin.h"
int main(int argc,char**argv){assert(argc==2);char filename[4096];snprintf(filename,sizeof(filename),"%s/result.json",argv[1]);FILE*f=fopen(filename,"w");assert(f);fprintf(f,"{\"frames\":[");for(int k=0;k<3;k++){double target=220.*(k+1);fvec_t*input=new_fvec(2048),*result=new_fvec(1);aubio_pitchyin_t*engine=new_aubio_pitchyin(2048);for(int i=0;i<2048;i++)input->data[i]=.7*sin(2*M_PI*target*i/44100)+.2*sin(4*M_PI*target*i/44100);aubio_pitchyin_do(engine,input,result);double detected=44100./result->data[0],confidence=aubio_pitchyin_get_confidence(engine);assert(isfinite(detected)&&fabs(detected-target)/target<.01&&confidence>.95);fprintf(f,"%s{\"targetHz\":%.8f,\"detectedHz\":%.8f,\"confidence\":%.8f,\"paths\":[{\"color\":\"#57d8c6\",\"points\":[",k?",":"",target,detected,confidence);for(int i=0;i<512;i++)fprintf(f,"%s[%.8f,%.8f]",i?",":"",-0.9+1.8*i/511.,input->data[i]*.65);fprintf(f,"]}]}");del_aubio_pitchyin(engine);del_fvec(input);del_fvec(result);}fprintf(f,"]}");fclose(f);return 0;}
