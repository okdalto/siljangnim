math.randomseed(17)
sim.randomSeed(17,0,31,0)
sim.clearSim()
sim.paused(false)
tpt.setdebug(0)
for x=77,533 do for y=348,353 do sim.partCreate(-1,x,y,elem.DEFAULT_PT_DMND) end end
for y=34,347 do for x=77,82 do sim.partCreate(-1,x,y,elem.DEFAULT_PT_DMND);sim.partCreate(-1,x+448,y,elem.DEFAULT_PT_DMND) end end
for x=77,533 do for y=28,33 do sim.partCreate(-1,x,y,elem.DEFAULT_PT_DMND) end end
for y=80,130 do for x=110,270 do sim.partCreate(-1,x,y,elem.DEFAULT_PT_DUST) end end
for y=80,130 do for x=340,500 do sim.partCreate(-1,x,y,elem.DEFAULT_PT_WATR) end end
local steps=0
local saved={}
event.register(event.AFTERSIM,function() steps=steps+1 end)
event.register(event.AFTERSIMDRAW,function()
 if (steps==30 or steps==100 or steps==250) and not saved[steps] then
  local f=tpt.screenshot(0,0)
  os.rename(f,'render-'..steps..'.png')
  local counts={0,0};local cy={0,0}
  for id in sim.parts() do
   local typ=sim.partProperty(id,'type');local k=nil
   if typ==elem.DEFAULT_PT_DUST then k=1 elseif typ==elem.DEFAULT_PT_WATR then k=2 end
   if k then local x,y=sim.partPosition(id);counts[k]=counts[k]+1;cy[k]=cy[k]+y end
  end
  local out=io.open('stats-'..steps..'.txt','w');out:write(steps..' '..counts[1]..' '..counts[2]..' '..cy[1]/counts[1]..' '..cy[2]/counts[2]..'\n');out:close()
  saved[steps]=true
 end
 if steps>=250 then os.exit() end
end)
