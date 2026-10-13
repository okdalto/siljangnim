$fn=64;
difference(){
 union(){cylinder(h=1.4,r=.7);translate([0,0,-.1])cylinder(h=.15,r=.8);}
 translate([0,0,-.2])cylinder(h=1.9,r=.53);
 for(a=[0:30:330])for(z=[.22,.62,1.02])rotate([0,0,a+z*15])translate([.65,0,z])rotate([0,90,0])cylinder(h=.5,r=.13,center=true,$fn=16);
}
