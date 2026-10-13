#ifdef GL_ES
precision highp float;
#endif
uniform vec2 u_resolution;
uniform float u_phase;
void main(){
 vec2 p=(gl_FragCoord.xy-.5*u_resolution)/min(u_resolution.x,u_resolution.y);
 float r=length(p),a=atan(p.y,p.x);
 float f=sin(38.*r-2.8*sin(6.*a+u_phase));
 float rings=smoothstep(-.18,.18,f);
 vec3 c=mix(vec3(.025,.055,.11),vec3(.14,.79,.73),rings);
 c=mix(c,vec3(1.,.54,.2),.5+.5*sin(a*3.+u_phase))*(1.-smoothstep(.43,.52,r));
 gl_FragColor=vec4(c,1.);
}
